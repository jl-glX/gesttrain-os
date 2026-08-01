import { NextFunction, Request, Response } from "express";
import {
  body,
  param,
  query,
  ValidationChain,
  validationResult,
} from "express-validator";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const roles = ["member", "trainer", "admin"];

const strictBody = (allowedFields: string[], requireAtLeastOne = false) =>
  body().custom((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Request body must be an object");
    }

    const fields = Object.keys(value);
    const unknownFields = fields.filter(
      (field) => !allowedFields.includes(field),
    );

    if (unknownFields.length > 0) {
      throw new Error(`Unknown fields: ${unknownFields.join(", ")}`);
    }

    if (requireAtLeastOne && fields.length === 0) {
      throw new Error("At least one field must be provided");
    }

    return true;
  });

const emptyObjectOrMissing = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length > 0
  ) {
    throw new Error("This request does not accept fields");
  }
  return true;
};

function validateRequest(
  validations: ValidationChain[],
): Array<
  ValidationChain | ((req: Request, res: Response, next: NextFunction) => void)
> {
  return [
    ...validations,
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const details = errors.array({ onlyFirstError: true }).map((error) => ({
          type: error.type,
          location: "location" in error ? error.location : undefined,
          path: "path" in error ? error.path : undefined,
          message: error.msg,
        }));

        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details,
        });
        return;
      }

      next();
    },
  ];
}

export const validateId = (name: string) =>
  validateRequest([
    param(name)
      .isString()
      .matches(ID_PATTERN)
      .withMessage(`${name} must be a valid identifier`),
  ]);

export const signupValidation = validateRequest([
  strictBody(["email", "name", "password"]),
  body("email")
    .isString()
    .trim()
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }),
  body("name").isString().trim().isLength({ min: 1, max: 100 }),
  body("password")
    .isString()
    .isLength({ min: 12, max: 128 })
    .matches(/[a-z]/)
    .matches(/[A-Z]/)
    .matches(/[0-9]/),
]);

export const loginValidation = validateRequest([
  strictBody(["identifier", "password", "accessPortal", "rememberDevice"]),
  body("identifier")
    .isString()
    .trim()
    .isLength({ min: 3, max: 254 })
    .custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isPhone = /^\+?[0-9\s()-]{7,20}$/.test(value);
      if (!isEmail && !isPhone) {
        throw new Error("Identifier must be an email address or phone number");
      }
      return true;
    }),
  body("password").isString().isLength({ min: 1, max: 128 }),
  body("accessPortal").isIn(["member", "staff"]),
  body("rememberDevice").optional().isBoolean(),
]);

export const mfaCodeValidation = validateRequest([
  strictBody(["code"]),
  body("code")
    .isString()
    .trim()
    .matches(/^(?:\d{6}|[A-Fa-f0-9]{6}-?[A-Fa-f0-9]{6})$/)
    .withMessage("Code must be a 6-digit TOTP or a recovery code"),
]);

export const accountMfaConfirmationValidation = validateRequest([
  strictBody(["password", "code"]),
  body("password").isString().isLength({ min: 1, max: 128 }),
  body("code")
    .isString()
    .trim()
    .matches(/^(?:\d{6}|[A-Fa-f0-9]{6}-?[A-Fa-f0-9]{6})$/),
]);

export const passwordConfirmationValidation = validateRequest([
  strictBody(["password"]),
  body("password").isString().isLength({ min: 1, max: 128 }),
]);

export const passkeyAuthenticationOptionsValidation = validateRequest([
  strictBody(["identifier", "accessPortal", "rememberDevice"]),
  body("identifier").isString().trim().isLength({ min: 3, max: 254 }),
  body("accessPortal").isIn(["member", "staff"]),
  body("rememberDevice").optional().isBoolean(),
]);

export const passkeyResponseValidation = validateRequest([
  strictBody(["response"]),
  body("response").isObject(),
]);

export const sessionIdValidation = validateRequest([
  param("sessionId")
    .isString()
    .matches(/^[a-f0-9]{64}$/i),
]);

export const sessionSettingsValidation = validateRequest([
  strictBody(["timeoutMinutes"]),
  body("timeoutMinutes").isInt({ min: 15, max: 43_200 }).toInt(),
]);

export const inactivityPreferenceValidation = validateRequest([
  strictBody(["inactivityMonths"]),
  body("inactivityMonths").custom((value) => {
    if (value === null || value === "disabled") return true;
    return [6, 12, 18, 24, 36].includes(Number(value));
  }),
]);

export const deletionReviewValidation = validateRequest([
  strictBody(["selectedCategories", "intent"]),
  body("selectedCategories").isArray({ max: 5 }),
  body("selectedCategories.*").isIn([
    "account_profile",
    "preferences",
    "bookings",
    "billing_records",
    "security_events",
  ]),
  body("intent").isIn(["selected_data", "account_closure"]),
]);

export const emptyAccountDeletionRequestValidation = validateRequest([
  body().custom(emptyObjectOrMissing),
  query().custom(emptyObjectOrMissing),
]);

export const retentionPolicyValidation = validateRequest([
  strictBody([
    "name",
    "jurisdiction",
    "dataCategory",
    "retentionDays",
    "legalBasisReference",
  ]),
  body("name").isString().trim().isLength({ min: 1, max: 120 }),
  body("jurisdiction").isString().trim().isLength({ min: 1, max: 80 }),
  body("dataCategory").isString().trim().isLength({ min: 1, max: 80 }),
  body("retentionDays")
    .optional({ nullable: true, values: "falsy" })
    .isInt({ min: 1, max: 36_500 })
    .toInt(),
  body("legalBasisReference")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 }),
]);

export const delegationDurationValidation = validateRequest([
  strictBody(["duration"]),
  body("duration").isIn(["24h", "7d", "30d", "indefinite"]),
]);

export const delegationRedeemValidation = validateRequest([
  strictBody(["token"]),
  body("token")
    .isString()
    .trim()
    .matches(/^hfd_[A-Za-z0-9_-]{32}$/),
]);

export const resourceTaskStateValidation = validateRequest([
  param("taskId").isString().matches(ID_PATTERN),
  strictBody(["enabled"]),
  body("enabled").isBoolean(),
]);

export const feedbackValidation = validateRequest([
  strictBody(["category", "message"]),
  body("category").isIn(["suggestion", "problem", "accessibility", "other"]),
  body("message").isString().trim().isLength({ min: 10, max: 2000 }),
]);

const FACILITY_LOGO_MAX_BYTES = 512 * 1024;

export const facilityProfileValidation = validateRequest([
  strictBody(["name", "logoDataUrl", "accentColor"], true),
  body("name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("accentColor")
    .optional()
    .isString()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage("Accent color must use the #RRGGBB format"),
  body("logoDataUrl")
    .optional()
    .isString()
    .custom((value: string) => {
      if (value === "") return true;
      const match = value.match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
      );
      if (!match) {
        throw new Error("Logo must be a PNG, JPEG or WebP image");
      }
      if (Buffer.byteLength(match[2], "base64") > FACILITY_LOGO_MAX_BYTES) {
        throw new Error("Logo must not exceed 512 KB");
      }

      const bytes = Buffer.from(match[2], "base64");
      const hasExpectedSignature =
        (match[1] === "png" &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
        (match[1] === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
        (match[1] === "webp" &&
          bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP");

      if (!hasExpectedSignature) {
        throw new Error("Logo contents do not match the declared image format");
      }
      return true;
    }),
]);

export const accountProfileValidation = validateRequest([
  strictBody(["avatarDataUrl"], true),
  body("avatarDataUrl")
    .isString()
    .custom((value: string) => {
      if (value === "") return true;
      const match = value.match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
      );
      if (!match) {
        throw new Error("Avatar must be a PNG, JPEG or WebP image");
      }
      if (Buffer.byteLength(match[2], "base64") > FACILITY_LOGO_MAX_BYTES) {
        throw new Error("Avatar must not exceed 512 KB");
      }

      const bytes = Buffer.from(match[2], "base64");
      const hasExpectedSignature =
        (match[1] === "png" &&
          bytes
            .subarray(0, 8)
            .equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
        (match[1] === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) ||
        (match[1] === "webp" &&
          bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP");

      if (!hasExpectedSignature) {
        throw new Error(
          "Avatar contents do not match the declared image format",
        );
      }
      return true;
    }),
]);

const billingFields = [
  "userId",
  "customerName",
  "customerEmail",
  "concept",
  "billingCycle",
  "customCycleLabel",
  "amountCents",
  "currency",
  "status",
  "dueAt",
  "paidAt",
  "invoiceNumber",
  "notes",
];

const updateBillingFields = [...billingFields, "archivedAt"];

export const createBillingRecordValidation = validateRequest([
  strictBody(billingFields),
  body("userId").optional({ nullable: true }).isString().matches(ID_PATTERN),
  body("customerName").isString().trim().isLength({ min: 1, max: 120 }),
  body("customerEmail")
    .optional({ values: "falsy" })
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }),
  body("concept").isString().trim().isLength({ min: 1, max: 160 }),
  body("billingCycle")
    .isIn([
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
      "trial_day",
      "custom",
    ])
    .custom((value, { req }) => {
      if (
        value === "custom" &&
        (typeof req.body.customCycleLabel !== "string" ||
          req.body.customCycleLabel.trim().length === 0)
      ) {
        throw new Error("Custom billing cycles require a description");
      }
      return true;
    }),
  body("customCycleLabel").optional().isString().trim().isLength({ max: 160 }),
  body("amountCents").isInt({ min: 0, max: 100000000 }).toInt(),
  body("currency").isString().trim().isLength({ min: 3, max: 3 }),
  body("status").isIn(["paid", "unpaid", "pending"]),
  body("dueAt").optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body("paidAt").optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body("invoiceNumber")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 80 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
]);

export const updateBillingRecordValidation = validateRequest([
  param("id").isString().matches(ID_PATTERN),
  strictBody(updateBillingFields, true),
  body("userId").optional({ nullable: true }).isString().matches(ID_PATTERN),
  body("customerName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 }),
  body("customerEmail")
    .optional({ values: "falsy" })
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }),
  body("concept").optional().isString().trim().isLength({ min: 1, max: 160 }),
  body("billingCycle")
    .optional()
    .isIn([
      "monthly",
      "quarterly",
      "semiannual",
      "annual",
      "trial_day",
      "custom",
    ]),
  body("customCycleLabel").optional().isString().trim().isLength({ max: 160 }),
  body("amountCents").optional().isInt({ min: 0, max: 100000000 }).toInt(),
  body("currency").optional().isString().trim().isLength({ min: 3, max: 3 }),
  body("status").optional().isIn(["paid", "unpaid", "pending"]),
  body("dueAt").optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body("paidAt").optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body("invoiceNumber")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 80 }),
  body("notes").optional().isString().trim().isLength({ max: 1000 }),
  body("archivedAt").optional({ nullable: true }).isInt({ min: 0 }).toInt(),
]);

export const bookingValidation = validateRequest([
  strictBody(["classId", "userId"]),
  body("classId").isString().matches(ID_PATTERN),
  body("userId").isString().matches(ID_PATTERN),
]);

export const bookingCancellationValidation = validateRequest([
  param("bookingId").isString().matches(ID_PATTERN),
  strictBody(["userId"]),
  body("userId").isString().matches(ID_PATTERN),
]);

const classFields = [
  strictBody([
    "name",
    "description",
    "trainerId",
    "trainerName",
    "maxCapacity",
    "scheduledAt",
  ]),
  body("name").isString().trim().isLength({ min: 1, max: 100 }),
  body("description").optional().isString().trim().isLength({ max: 1000 }),
  body("trainerId").isString().matches(ID_PATTERN),
  body("trainerName").isString().trim().isLength({ max: 100 }),
  body("maxCapacity").isInt({ min: 1, max: 10000 }).toInt(),
  body("scheduledAt").isInt({ min: 1 }).toInt(),
];

export const createClassValidation = validateRequest(classFields);

export const updateClassValidation = validateRequest([
  param("id").isString().matches(ID_PATTERN),
  strictBody(
    [
      "name",
      "description",
      "trainerId",
      "trainerName",
      "maxCapacity",
      "scheduledAt",
    ],
    true,
  ),
  body("name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("description").optional().isString().trim().isLength({ max: 1000 }),
  body("trainerId").optional().isString().matches(ID_PATTERN),
  body("trainerName")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 }),
  body("maxCapacity").optional().isInt({ min: 1, max: 10000 }).toInt(),
  body("scheduledAt").optional().isInt({ min: 1 }).toInt(),
]);

export const createUserValidation = validateRequest([
  strictBody(["email", "name", "password", "role"]),
  body("email")
    .isString()
    .trim()
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }),
  body("name").isString().trim().isLength({ min: 1, max: 100 }),
  body("password")
    .isString()
    .isLength({ min: 12, max: 128 })
    .matches(/[a-z]/)
    .matches(/[A-Z]/)
    .matches(/[0-9]/),
  body("role").optional().isIn(roles),
]);

export const updateUserValidation = validateRequest([
  param("id").isString().matches(ID_PATTERN),
  strictBody(["email", "name", "password", "role"], true),
  body("email")
    .optional()
    .isString()
    .trim()
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 254 }),
  body("name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("password")
    .optional()
    .isString()
    .isLength({ min: 12, max: 128 })
    .matches(/[a-z]/)
    .matches(/[A-Z]/)
    .matches(/[0-9]/),
  body("role").optional().isIn(roles),
]);

export const updateRoleValidation = validateRequest([
  param("id").isString().matches(ID_PATTERN),
  strictBody(["role"]),
  body("role").isIn(roles),
]);

export const bulkDeleteUsersValidation = validateRequest([
  strictBody(["userIds"]),
  body("userIds")
    .isArray({ min: 1, max: 100 })
    .withMessage("userIds must contain between 1 and 100 identifiers"),
  body("userIds.*").isString().matches(ID_PATTERN),
]);

export const monthValidation = validateRequest([
  query("year").isInt({ min: 2000, max: 2200 }).toInt(),
  query("month").isInt({ min: 1, max: 12 }).toInt(),
]);
