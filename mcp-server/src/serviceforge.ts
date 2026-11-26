export interface Technician {
  id: number;
  name: string;
  region: string;
  skills: string[];
}

export interface Job {
  id: number;
  technicianId: number;
  customerName: string;
  startTime: string;
  endTime: string;
  status: string;
}

export interface PartStockResponse {
  sku: string;
  name: string;
  quantityOnHand: number;
  reserved: number;
  available: number;
}

export interface Reservation {
  id: string;
  sku: string;
  jobId: number;
  quantity: number;
}

interface ApiError {
  message: string;
}

export class ServiceForgeError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ServiceForgeError";
  }
}

export class ServiceForgeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options?.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `ServiceForge at ${this.baseUrl} did not respond: ${msg}. Is mvn spring-boot:run up?`
      );
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const message = (body as ApiError)?.message ?? `HTTP ${response.status}`;
      throw new ServiceForgeError(message, response.status, body);
    }

    return response.json() as Promise<T>;
  }

  async getTechnicians(): Promise<Technician[]> {
    return this.request<Technician[]>("/api/technicians");
  }

  async getTechnicianJobs(technicianId: number): Promise<Job[]> {
    return this.request<Job[]>(`/api/technicians/${technicianId}/jobs`);
  }

  async getParts(): Promise<PartStockResponse[]> {
    return this.request<PartStockResponse[]>("/api/parts");
  }

  async getPart(sku: string): Promise<PartStockResponse> {
    return this.request<PartStockResponse>(
      `/api/parts/${encodeURIComponent(sku)}`
    );
  }

  async reservePart(
    sku: string,
    jobId: number,
    quantity: number
  ): Promise<Reservation> {
    return this.request<Reservation>(
      `/api/parts/${encodeURIComponent(sku)}/reservations`,
      {
        method: "POST",
        body: JSON.stringify({ jobId, quantity }),
      }
    );
  }
}
