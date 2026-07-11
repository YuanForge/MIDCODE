package handler

import (
	"context"
	"log"
	"time"

	"fanapi/internal/db"
	"fanapi/internal/model"
)

const (
	llmLogWriterBatchSize     = 500
	llmLogWriterFlushInterval = 50 * time.Millisecond
	llmLogWriterChanCap       = 20000
)

type llmLogOpKind int

const (
	llmLogOpCreate llmLogOpKind = iota + 1
	llmLogOpPatch
)

type llmLogOp struct {
	kind   llmLogOpKind
	corrID string
	record model.LLMLog
	cols   []string
}

type llmLogPending struct {
	record    model.LLMLog
	hasCreate bool
	patchCols map[string]bool
}

var llmLogWriteCh chan llmLogOp

func StartLLMLogBatchWriter(ctx context.Context) {
	if llmLogWriteCh != nil {
		return
	}
	llmLogWriteCh = make(chan llmLogOp, llmLogWriterChanCap)
	go runLLMLogWriter(ctx)
	log.Printf("[llm-log-writer] started (batch=%d flush=%s)", llmLogWriterBatchSize, llmLogWriterFlushInterval)
}

func enqueueLLMLogInsert(record model.LLMLog) {
	stripLLMLogPayload(&record)
	op := llmLogOp{
		kind:   llmLogOpCreate,
		corrID: record.CorrID,
		record: record,
	}
	if llmLogWriteCh == nil {
		if _, err := db.Engine.Insert(&record); err != nil {
			log.Printf("[llm-log-writer] sync insert failed corr_id=%s: %v", record.CorrID, err)
		}
		return
	}
	select {
	case llmLogWriteCh <- op:
	default:
		log.Printf("[llm-log-writer] channel full, flushing create corr_id=%s immediately", record.CorrID)
		flushLLMLogBatch([]llmLogOp{op})
	}
}

func enqueueLLMLogPatch(corrID string, cols []string, patch model.LLMLog) {
	if corrID == "" || len(cols) == 0 {
		return
	}
	stripLLMLogPayload(&patch)
	op := llmLogOp{
		kind:   llmLogOpPatch,
		corrID: corrID,
		record: patch,
		cols:   append([]string(nil), cols...),
	}
	if llmLogWriteCh == nil {
		if _, err := db.Engine.Where("corr_id = ?", corrID).Cols(cols...).Update(&patch); err != nil {
			log.Printf("[llm-log-writer] sync patch failed corr_id=%s cols=%v: %v", corrID, cols, err)
		}
		return
	}
	select {
	case llmLogWriteCh <- op:
	default:
		log.Printf("[llm-log-writer] channel full, flushing patch corr_id=%s immediately", corrID)
		flushLLMLogBatch([]llmLogOp{op})
	}
}

func runLLMLogWriter(ctx context.Context) {
	ticker := time.NewTicker(llmLogWriterFlushInterval)
	defer ticker.Stop()

	batch := make([]llmLogOp, 0, llmLogWriterBatchSize)
	for {
		select {
		case item := <-llmLogWriteCh:
			batch = append(batch, item)
			if len(batch) >= llmLogWriterBatchSize {
				flushLLMLogBatch(batch)
				batch = batch[:0]
			}
		case <-ticker.C:
			if len(batch) > 0 {
				flushLLMLogBatch(batch)
				batch = batch[:0]
			}
		case <-ctx.Done():
		drain:
			for {
				select {
				case item := <-llmLogWriteCh:
					batch = append(batch, item)
				default:
					break drain
				}
			}
			if len(batch) > 0 {
				flushLLMLogBatch(batch)
			}
			return
		}
	}
}

func flushLLMLogBatch(items []llmLogOp) {
	if len(items) == 0 {
		return
	}

	pending := make(map[string]*llmLogPending, len(items))
	order := make([]string, 0, len(items))
	for _, item := range items {
		if item.corrID == "" {
			continue
		}
		state, ok := pending[item.corrID]
		if !ok {
			state = &llmLogPending{patchCols: map[string]bool{}}
			pending[item.corrID] = state
			order = append(order, item.corrID)
		}
		switch item.kind {
		case llmLogOpCreate:
			patchSnapshot := state.record
			patchCols := make([]string, 0, len(state.patchCols))
			for col := range state.patchCols {
				patchCols = append(patchCols, col)
			}
			state.record = item.record
			state.hasCreate = true
			applyLLMLogPatch(state, patchCols, patchSnapshot)
		case llmLogOpPatch:
			applyLLMLogPatch(state, item.cols, item.record)
		}
	}

	createRecords := make([]model.LLMLog, 0, len(order))
	patchStates := make([]struct {
		corrID string
		state  *llmLogPending
	}, 0, len(order))
	for _, corrID := range order {
		state := pending[corrID]
		if state == nil {
			continue
		}
		if state.hasCreate {
			createRecords = append(createRecords, state.record)
			continue
		}
		patchStates = append(patchStates, struct {
			corrID string
			state  *llmLogPending
		}{corrID: corrID, state: state})
	}

	if len(createRecords) > 0 {
		if _, err := db.Engine.Insert(&createRecords); err != nil {
			log.Printf("[llm-log-writer] batch insert (%d rows): %v", len(createRecords), err)
			for i := range createRecords {
				record := createRecords[i]
				if _, singleErr := db.Engine.Insert(&record); singleErr != nil {
					log.Printf("[llm-log-writer] single insert failed corr_id=%s: %v", record.CorrID, singleErr)
				}
			}
		}
	}

	for _, item := range patchStates {
		cols := make([]string, 0, len(item.state.patchCols))
		for col := range item.state.patchCols {
			cols = append(cols, col)
		}
		if len(cols) == 0 {
			continue
		}
		if _, err := db.Engine.Where("corr_id = ?", item.corrID).Cols(cols...).Update(&item.state.record); err != nil {
			log.Printf("[llm-log-writer] patch failed corr_id=%s cols=%v: %v", item.corrID, cols, err)
		}
	}
}

func applyLLMLogPatch(state *llmLogPending, cols []string, patch model.LLMLog) {
	if state == nil {
		return
	}
	stripLLMLogPayload(&patch)
	for _, col := range cols {
		switch col {
		case "status":
			state.record.Status = patch.Status
		case "error_msg":
			state.record.ErrorMsg = patch.ErrorMsg
		case "usage":
			state.record.Usage = patch.Usage
		case "upstream_status":
			state.record.UpstreamStatus = patch.UpstreamStatus
		case "upstream_headers":
			state.record.UpstreamHeaders = patch.UpstreamHeaders
		case "upstream_url":
			state.record.UpstreamURL = patch.UpstreamURL
		case "upstream_method":
			state.record.UpstreamMethod = patch.UpstreamMethod
		case "transport":
			state.record.Transport = patch.Transport
		case "input_price_per_1m_tokens":
			state.record.InputPricePer1MTokens = patch.InputPricePer1MTokens
		case "output_price_per_1m_tokens":
			state.record.OutputPricePer1MTokens = patch.OutputPricePer1MTokens
		case "model":
			state.record.Model = patch.Model
		case "is_stream":
			state.record.IsStream = patch.IsStream
		case "client_request", "upstream_request", "client_response", "upstream_response":
			continue
		}
		state.patchCols[col] = true
	}
}

func stripLLMLogPayload(record *model.LLMLog) {
	if record == nil {
		return
	}
	record.ErrorMsg = limitLLMLogErrorSummary(record.ErrorMsg)
	record.ClientRequest = nil
	record.UpstreamRequest = nil
	record.ClientResponse = nil
	record.UpstreamResponse = nil
}
