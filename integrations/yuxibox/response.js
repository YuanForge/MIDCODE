function mapResponse(output) {
    if (output.error || output.status === 'failed') {
        var err = output.error;
        return {status: 3, msg: typeof err === 'string' ? err : (err && err.message) || 'Video generation failed'};
    }
    if (typeof output.id !== 'string' || !output.id.trim()) {
        throw new Error('YuxiBox did not return a task id; submission may have been accepted; do not resubmit automatically');
    }
    return {status: 1, upstream_task_id: output.id};
}
