export class ServiceForgeError extends Error {
    statusCode;
    body;
    constructor(message, statusCode, body) {
        super(message);
        this.statusCode = statusCode;
        this.body = body;
        this.name = "ServiceForgeError";
    }
}
export class ServiceForgeClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl.replace(/\/$/, "");
    }
    async request(path, options) {
        const url = `${this.baseUrl}${path}`;
        let response;
        try {
            response = await fetch(url, {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...options?.headers,
                },
                signal: AbortSignal.timeout(10_000),
            });
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`ServiceForge at ${this.baseUrl} did not respond: ${msg}. Is mvn spring-boot:run up?`);
        }
        if (!response.ok) {
            let body;
            try {
                body = await response.json();
            }
            catch {
                body = null;
            }
            const message = body?.message ?? `HTTP ${response.status}`;
            throw new ServiceForgeError(message, response.status, body);
        }
        return response.json();
    }
    async getTechnicians() {
        return this.request("/api/technicians");
    }
    async getTechnicianJobs(technicianId) {
        return this.request(`/api/technicians/${technicianId}/jobs`);
    }
    async getParts() {
        return this.request("/api/parts");
    }
    async getPart(sku) {
        return this.request(`/api/parts/${encodeURIComponent(sku)}`);
    }
    async reservePart(sku, jobId, quantity) {
        return this.request(`/api/parts/${encodeURIComponent(sku)}/reservations`, {
            method: "POST",
            body: JSON.stringify({ jobId, quantity }),
        });
    }
}
