import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { calculateNightSegments, validateNightInput } from "@prophetic-night/night-engine";
import {
  demoPrayerTimes,
  IslamicAppPrayerTimeProvider,
  LondonUnifiedPrayerTimeProvider,
  PrayerProviderError,
} from "@prophetic-night/prayer-providers";
import type { PrayerTimeProvider } from "@prophetic-night/prayer-providers";
import Fastify from "fastify";
import type { FastifyError } from "fastify";
import type { NightCalculationInput } from "@prophetic-night/night-engine";

const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["maghrib", "fajr", "timeZone"],
  properties: {
    maghrib: {
      type: "string",
      description: "ISO 8601 Maghrib timestamp with explicit date and UTC offset.",
    },
    fajr: {
      type: "string",
      description: "ISO 8601 following-Fajr timestamp with explicit date and UTC offset.",
    },
    timeZone: { type: "string", description: "IANA timezone used only for presentation." },
    locale: { type: "string", default: "en-GB" },
    displayFormat: { type: "string", enum: ["12h", "24h"], default: "24h" },
    showSeconds: { type: "boolean", default: false },
    fajrWakeBufferMinutes: { type: "number", minimum: 0, default: 0 },
    allowLongNight: {
      type: "boolean",
      default: false,
      description: "Explicitly accept an interval longer than 18 hours.",
    },
  },
} as const;

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "details"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        field: { type: "string" },
        details: { type: "object", additionalProperties: true },
      },
    },
  },
} as const;

const coordinateInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["latitude", "longitude", "serviceDate", "timeZone"],
  properties: {
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    serviceDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    timeZone: { type: "string", description: "IANA timezone for the coordinates." },
    calculationMethod: { type: "integer", minimum: 0 },
    prayerTimeSource: {
      type: "string",
      enum: ["coordinates", "london-unified"],
      default: "coordinates",
    },
    locale: { type: "string", default: "en-GB" },
    displayFormat: { type: "string", enum: ["12h", "24h"], default: "24h" },
    showSeconds: { type: "boolean", default: false },
    fajrWakeBufferMinutes: { type: "number", minimum: 0, default: 0 },
  },
} as const;

interface CoordinateRequest {
  latitude: number;
  longitude: number;
  serviceDate: string;
  timeZone: string;
  calculationMethod?: number;
  prayerTimeSource?: "coordinates" | "london-unified";
  locale?: string;
  displayFormat?: "12h" | "24h";
  showSeconds?: boolean;
  fajrWakeBufferMinutes?: number;
}

export interface BuildAppOptions {
  prayerTimeProvider?: PrayerTimeProvider;
  londonUnifiedPrayerTimeProvider?: PrayerTimeProvider;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const prayerTimeProvider = options.prayerTimeProvider ?? new IslamicAppPrayerTimeProvider();
  const londonUnifiedPrayerTimeProvider =
    options.londonUnifiedPrayerTimeProvider ?? new LondonUnifiedPrayerTimeProvider();
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { allErrors: true, removeAdditional: false } },
  });
  await app.register(
    helmet,
    process.env.NODE_ENV === "production" ? {} : { contentSecurityPolicy: false },
  );
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Prophetic Night Segments API",
        version: "0.1.0",
        description:
          "Provider-agnostic Islamic-night segmentation. The supplied interval [Maghrib, following Fajr) is divided by exact integer-millisecond boundaries. Parts 5–6 are the last third; Parts 4–5 form the separately narrated Dāwūd prayer period. This informational scheduling API does not determine prayer times or issue religious rulings.",
      },
      servers: [{ url: "http://localhost:3001" }],
      tags: [{ name: "night", description: "Versioned night calculation endpoints" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  app.get(
    "/api/v1/health",
    {
      schema: {
        tags: ["night"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              service: { type: "string" },
              version: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok", service: "prophetic-night-segments", version: "0.1.0" }),
  );

  app.post<{ Body: NightCalculationInput }>(
    "/api/v1/night/calculate",
    {
      schema: {
        tags: ["night"],
        summary: "Divide a supplied Maghrib-to-Fajr interval into sixths and thirds",
        description:
          "Fajr must be after Maghrib as an absolute instant. Crossing midnight and offset changes are represented by the explicit offsets. The API returns exact ISO instants without presentation rounding.",
        body: inputSchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const errors = validateNightInput(request.body);
      if (errors.length) return reply.code(400).send({ error: errors[0] });
      return calculateNightSegments(request.body);
    },
  );

  app.post<{ Body: CoordinateRequest }>(
    "/api/v1/night/calculate-from-coordinates",
    {
      schema: {
        tags: ["night"],
        summary: "Source prayer times by coordinates, then divide the night",
        description:
          "The configured prayer-time provider supplies Maghrib for serviceDate and Fajr for the following local date. The segmentation engine only receives the resulting absolute instants. Calculation methods vary between providers and communities; callers should select and verify the appropriate method.",
        body: coordinateInputSchema,
        response: {
          200: { type: "object", additionalProperties: true },
          400: errorSchema,
          502: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const selectedProvider =
          request.body.prayerTimeSource === "london-unified"
            ? londonUnifiedPrayerTimeProvider
            : prayerTimeProvider;
        const prayerTimes = await selectedProvider.getPrayerTimes(request.body);
        const calculationInput: NightCalculationInput = {
          maghrib: prayerTimes.maghrib,
          fajr: prayerTimes.fajr,
          timeZone: prayerTimes.timeZone,
          ...(request.body.locale === undefined ? {} : { locale: request.body.locale }),
          ...(request.body.displayFormat === undefined
            ? {}
            : { displayFormat: request.body.displayFormat }),
          ...(request.body.showSeconds === undefined
            ? {}
            : { showSeconds: request.body.showSeconds }),
          ...(request.body.fajrWakeBufferMinutes === undefined
            ? {}
            : { fajrWakeBufferMinutes: request.body.fajrWakeBufferMinutes }),
        };
        const errors = validateNightInput(calculationInput);
        if (errors.length) {
          return reply.code(502).send({
            error: {
              code: "INVALID_PROVIDER_RESPONSE",
              message: "Prayer-time provider returned an unusable night interval.",
              details: { validationCode: errors[0]!.code },
            },
          });
        }
        return {
          ...calculateNightSegments(calculationInput),
          prayerTimes: {
            provider: prayerTimes.source,
            calculationMethod: prayerTimes.calculationMethod,
            timeZone: prayerTimes.timeZone,
            ...(prayerTimes.dailyPrayerTimes === undefined
              ? {}
              : { dailyPrayerTimes: prayerTimes.dailyPrayerTimes }),
          },
        };
      } catch (error) {
        if (error instanceof PrayerProviderError) {
          const status =
            error.code === "INVALID_PROVIDER_INPUT"
              ? 400
              : error.code === "PROVIDER_UNAVAILABLE"
                ? 503
                : 502;
          return reply.code(status).send({
            error: { code: error.code, message: error.message, details: {} },
          });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/v1/night/example",
    {
      schema: {
        tags: ["night"],
        summary: "Return a fixed London demonstration calculation",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async () => {
      const fixture = demoPrayerTimes["london-summer"]!;
      return calculateNightSegments({
        maghrib: fixture.maghrib,
        fajr: fixture.fajr,
        timeZone: fixture.timeZone,
        locale: "en-GB",
        displayFormat: "24h",
        fajrWakeBufferMinutes: 20,
      });
    },
  );

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation)
      return reply.code(400).send({
        error: {
          code: "INVALID_REQUEST",
          message: "Request body did not match the documented schema.",
          details: { validation: error.validation },
        },
      });
    app.log.error(error);
    return reply.code(500).send({
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred.", details: {} },
    });
  });
  return app;
}
