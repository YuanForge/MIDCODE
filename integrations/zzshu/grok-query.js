function mapResponse(response) {
    var data = response.data || response;
    var status = String(data.status || data.state || '').toLowerCase();
    if (/^(failed|error|cancelled|canceled|expired|rejected)$/.test(status)) {
        return {status: 3, msg: String(data.fail_reason || (data.error && data.error.message) || data.message || status)};
    }
    if (/^(done|completed|succeeded|success)$/.test(status) && data.delivery_url) {
        return {status: 2, progress: 100, url: data.delivery_url, duration: Number(data.video && data.video.duration) || 0};
    }
    return {status: 1, progress: Math.min(Number(data.progress) || 0, 99)};
}
