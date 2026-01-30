// Cloudflare Pages _worker.js to inject environment variable
export default {
    async fetch(request, env) {
        // Inject the API key into the environment
        env.ALIYUN_API_KEY = env.ALIYUN_API_KEY || 'sk-1f4309e84b9045778449d9349d6e457a';

        // Forward to the Functions
        return env.ASSETS.fetch(request);
    }
};
