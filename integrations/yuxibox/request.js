// Executed by FanAPI's Goja runtime. Keep normalizeRequest free of side effects.
function normalizeRequest(input) {
    var specs = {
        'seedance-2.5（YX）': [30, 4, 30, 30, 10, 10],
        'seedance-2.5（YX）-按次': [30, 30, 30, 30, 10, 10],
        'seedance2.5-yx-count': [30, 4, 30, 30, 10, 10],
        'seedance-2.0（YX）': [15, 5, 15, 9, 3, 3],
        'seedance-2.0（官渠）': [15, 4, 15, 9, 0, 3]
    };
    var spec = specs[input.model];
    if (!spec) throw new Error('Unsupported YuxiBox Seedance model');
    var official = input.model === 'seedance-2.0（官渠）';
    if (typeof input.prompt !== 'string' || !input.prompt.trim() || Array.from(input.prompt).length > 16000) {
        throw new Error('prompt must contain 1–16000 characters');
    }
    function present(v) { return v !== undefined && v !== null && v !== ''; }
    function seconds(v) {
        if ((typeof v !== 'string' && typeof v !== 'number') || !/^\d+$/.test(String(v))) {
            throw new Error('duration / seconds must be an integer');
        }
        return Number(v);
    }
    var duration = present(input.duration) ? seconds(input.duration) :
        present(input.seconds) ? seconds(input.seconds) : spec[0];
    if (present(input.duration) && present(input.seconds) && duration !== seconds(input.seconds)) {
        throw new Error('duration and seconds disagree');
    }
    if (duration < spec[1] || duration > spec[2] ||
        (input.model === 'seedance-2.0（YX）' && [5, 10, 15].indexOf(duration) < 0)) {
        throw new Error('Unsupported duration for ' + input.model);
    }
    var ratio = input.aspect_ratio || input.ratio || '';
    if (input.aspect_ratio && input.ratio && input.aspect_ratio !== input.ratio) {
        throw new Error('aspect_ratio and ratio disagree');
    }
    var ratios = official ? ['16:9', '9:16'] : ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'];
    if (ratio && ratios.indexOf(ratio) < 0) throw new Error('Unsupported aspect ratio');
    var size = input.size || '';
    var sizes = {'1280x720': '16:9', '720x1280': '9:16', '720x720': '1:1'};
    // The platform uses resolution tiers; YuxiBox expects dimensions or ratio.
    if (typeof size !== 'string') throw new Error('size must be a string');
    if (size.toLowerCase() === '720p') size = '';
    if (size && (!sizes[size] || (official && size === '720x720'))) throw new Error('Only supported 720P sizes are allowed');
    if (size && ratio && sizes[size] !== ratio) throw new Error('size and aspect ratio disagree');
    ratio = ratio || sizes[size] || '16:9';
    if (present(input.resolution) && String(input.resolution).toLowerCase() !== '720p') {
        throw new Error('resolution must be 720P');
    }
    function references(primary, alias, limit) {
        var a = input[primary], b = input[alias];
        if (a != null && !Array.isArray(a)) throw new Error(primary + ' must be an array');
        if (b != null && !Array.isArray(b)) throw new Error(alias + ' must be an array');
        if (a && a.length && b && b.length && JSON.stringify(a) !== JSON.stringify(b)) {
            throw new Error(primary + ' and ' + alias + ' disagree');
        }
        var values = a && a.length ? a : b || [];
        if (values.length > limit) throw new Error(primary + ' exceeds limit ' + limit);
        values.forEach(function (url) {
            var valid = typeof url === 'string' && (official ? /^https?:\/\//i.test(url) : /^(https:\/\/|data:)/i.test(url));
            if (!valid) throw new Error(primary + ' contains an unsupported URL');
            // Public URL reachability and media decoding are validated upstream.
            if (official && /^https?:\/\/[^/]*@/i.test(url)) throw new Error('URLs must not contain credentials');
        });
        return values;
    }
    var out = {
        model: input.model, prompt: input.prompt, duration: String(duration),
        size: '720p', aspect_ratio: ratio,
        refer_images: references('refer_images', 'reference_images', spec[3]),
        refer_videos: references('refer_videos', 'videos', spec[4]),
        audios: references('audios', 'refer_audios', spec[5])
    };
    if (present(input.input_reference)) {
        if (official) throw new Error('Official channel does not support input_reference');
        if (typeof input.input_reference !== 'string' || !/^(https:\/\/|data:)/i.test(input.input_reference)) {
            throw new Error('input_reference must be an HTTPS or data URL');
        }
        if (out.refer_images.length >= spec[3]) throw new Error('Too many reference images including input_reference');
        out.input_reference = input.input_reference;
    }
    return out;
}

function mapRequest(input) {
    var normalized = normalizeRequest(input);
    var out = {
        model: normalized.model, prompt: normalized.prompt,
        seconds: Number(normalized.duration), ratio: normalized.aspect_ratio,
        _disable_submit_retry: true
    };
    if (normalized.refer_images.length) out.reference_images = normalized.refer_images;
    if (normalized.refer_videos.length) out.videos = normalized.refer_videos;
    if (normalized.audios.length) out.audios = normalized.audios;
    if (normalized.input_reference) out.input_reference = normalized.input_reference;
    if (normalized.model === 'seedance-2.0（官渠）') out.resolution = '720P';
    return out;
}
