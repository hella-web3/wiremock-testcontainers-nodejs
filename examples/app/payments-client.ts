/**
 * The system under test of these examples: a typed client for a payments REST API – the kind of
 * code you point at WireMock instead of the real service. It knows nothing about WireMock: tests
 * only hand it the container's base URL.
 *
 * @see https://hella-web3.github.io/wiremock-testcontainers-nodejs/docs/guides/verifying-requests
 */

/** A payment as the API returns it. */
export interface Payment {
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: "PENDING" | "SETTLED" | "FAILED";
}

/** A page of payments. */
export interface PaymentPage {
  readonly items: readonly Payment[];
  readonly meta: { readonly totalItems: number };
}

/** What `POST /payments` accepts. */
export interface NewPayment {
  readonly amount: string;
  readonly currency: string;
}

/** What `POST /payments` answers: the new payment's id and initial status. */
export interface PaymentReceipt {
  readonly id: string;
  readonly status: Payment["status"];
}

/** A non-2xx answer, with the status code for assertions. */
export class PaymentsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PaymentsApiError";
    this.status = status;
  }
}

/** Options of {@link PaymentsClient}. */
export interface PaymentsClientOptions {
  /** Sent as `Authorization: Bearer <apiKey>`. */
  readonly apiKey?: string;
}

// #region client
export class PaymentsClient {
  readonly #baseUrl: string;
  readonly #headers: Readonly<Record<string, string>>;

  /** @param baseUrl E.g. `wiremock.getUrl()` in tests, the real API's URL in production. */
  constructor(baseUrl: string, options: PaymentsClientOptions = {}) {
    this.#baseUrl = baseUrl.replace(/\/+$/u, "");
    this.#headers = {
      Accept: "application/json",
      ...(options.apiKey === undefined ? {} : { Authorization: `Bearer ${options.apiKey}` }),
    };
  }

  /** `GET /payments`, or `GET /payments?page=<page>`. */
  async list(page?: number): Promise<PaymentPage> {
    return this.#request("GET", page === undefined ? "/payments" : `/payments?page=${page}`);
  }

  /** `GET /payments/<id>`. */
  async get(id: string): Promise<Payment> {
    return this.#request("GET", `/payments/${encodeURIComponent(id)}`);
  }

  /** `POST /payments` with a JSON body and an idempotency key. */
  async create(payment: NewPayment, idempotencyKey: string): Promise<PaymentReceipt> {
    return this.#request("POST", "/payments", payment, { "Idempotency-Key": idempotencyKey });
  }

  async #request<T>(method: string, path: string, body?: object, headers: Record<string, string> = {}): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: { ...this.#headers, ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new PaymentsApiError(response.status, `${method} ${path} failed with ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as T;
  }
}
// #endregion client
