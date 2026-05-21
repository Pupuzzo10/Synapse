const { z } = require("zod");

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Il nome utente deve contenere almeno 2 caratteri.")
  .max(40, "Il nome utente non puo superare 40 caratteri.")
  .regex(/^[a-zA-Z0-9 _.-]+$/, "Il nome utente puo contenere solo lettere, numeri, spazi, punti, trattini e underscore.");

const emailSchema = z
  .email("Inserisci un indirizzo email valido.")
  .transform((value) => value.trim().toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "La password deve contenere almeno 8 caratteri.")
  .max(72, "La password non puo superare 72 caratteri.")
  .refine((value) => /[A-Z]/.test(value), {
    message: "La password deve contenere almeno una lettera maiuscola.",
  })
  .refine((value) => /[a-z]/.test(value), {
    message: "La password deve contenere almeno una lettera minuscola.",
  })
  .refine((value) => /\d/.test(value), {
    message: "La password deve contenere almeno un numero.",
  });

const registerSchema = z
  .object({
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    passwordConfirm: z.string(),
    marketingOptIn: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.passwordConfirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordConfirm"],
        message: "Le password non coincidono.",
      });
    }
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Inserisci la password."),
});

function formatZodError(error) {
  const firstIssue = error.issues[0];
  return firstIssue ? firstIssue.message : "I dati inviati non sono validi.";
}

function parseRegisterInput(payload) {
  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: formatZodError(parsed.error),
      issues: parsed.error.flatten(),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

function parseLoginInput(payload) {
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: formatZodError(parsed.error),
      issues: parsed.error.flatten(),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

module.exports = {
  parseRegisterInput,
  parseLoginInput,
};
