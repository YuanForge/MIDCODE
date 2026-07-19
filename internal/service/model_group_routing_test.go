package service

import (
	"testing"

	"fanapi/internal/model"
)

func TestOrderModelGroupRoutesSkipsExcludedChannels(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 20, Priority: 2, Channel: model.Channel{ID: 200}},
		{GroupID: 10, Priority: 1, Channel: model.Channel{ID: 100}},
		{GroupID: 30, Priority: 3, Channel: model.Channel{ID: 300}},
	}

	ordered := orderModelGroupRoutes(routes, []int64{100})
	if len(ordered) != 2 || ordered[0].GroupID != 20 || ordered[1].GroupID != 30 {
		t.Fatalf("unexpected ordered routes: %+v", ordered)
	}
}

func TestOrderModelGroupRoutesKeepsPriorityOrder(t *testing.T) {
	routes := []ModelGroupRoute{
		{GroupID: 20, Priority: 2, Channel: model.Channel{ID: 200}},
		{GroupID: 10, Priority: 1, Channel: model.Channel{ID: 100}},
	}

	ordered := orderModelGroupRoutes(routes, nil)
	if len(ordered) != 2 || ordered[0].GroupID != 10 || ordered[1].GroupID != 20 {
		t.Fatalf("expected priority order, got %+v", ordered)
	}
}
