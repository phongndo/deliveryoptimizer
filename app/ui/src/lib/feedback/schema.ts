import { z } from "zod";

export const feedbackCategories = [
  "bug",
  "enhancement",
  "general",
  "question",
] as const;

export type FeedbackCategory = (typeof feedbackCategories)[number];

export const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  bug: "Bug",
  enhancement: "Enhancement",
  general: "General feedback",
  question: "Question",
};

export const feedbackScreenshotSchema = z.object({
  dataUrl: z.string().max(4_000_000),
  name: z.string().max(120).optional(),
});

export const feedbackDiagnosticsSchema = z
  .object({
    path: z.string().max(600).optional(),
    userAgent: z.string().max(500).optional(),
    viewport: z.string().max(80).optional(),
    devicePixelRatio: z.number().finite().positive().max(10).optional(),
    locale: z.string().max(80).optional(),
    timeZone: z.string().max(120).optional(),
    timestamp: z.string().datetime().optional(),
    lastClientError: z.string().max(1000).optional(),
  })
  .strict();

export const feedbackPayloadSchema = z
  .object({
    category: z.enum(feedbackCategories),
    title: z.string().trim().max(120).optional(),
    message: z.string().trim().min(8).max(4000),
    reproductionSteps: z.string().trim().max(3000).optional(),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .optional()
      .refine(
        (value) => !value || z.string().email().safeParse(value).success,
        {
          message: "Contact email must be a valid email address.",
        },
      ),
    diagnostics: feedbackDiagnosticsSchema,
    screenshot: feedbackScreenshotSchema.optional(),
    recaptchaToken: z.string().max(4000).optional(),
    company: z.string().max(200).optional(),
  })
  .strict();

export type FeedbackPayload = z.infer<typeof feedbackPayloadSchema>;
