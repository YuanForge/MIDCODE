function mapResponse(output) {
    if (output.status === 'failed') {
        var err = output.error;
        return {status: 3, msg: typeof err === 'string' ? err : (err && err.message) || 'Video generation failed'};
    }
    if (output.status === 'completed') {
        var url = output.video_url || output.download_url;
        // Never expose the authenticated /content endpoint as a public media URL.
        // Keep polling if completion precedes availability of a public URL.
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            return {status: 1, progress: 99, msg: 'Waiting for video download URL'};
        }
        return {status: 2, url: url, progress: 100, duration: Number(output.seconds) || 0};
    }
    return {status: 1, progress: Math.max(0, Math.min(99, Number(output.progress) || 0))};
}
