export { loginSchema } from "./common";
export {
  clientCreateSchema,
  clientUpdateSchema,
  sensitiveProfileSchema,
  type ClientCreateInput,
  type ClientUpdateInput,
} from "./client";
export {
  mailComposeSchema,
  mailDraftSchema,
  parseAddressList,
  type MailComposeInput,
  type MailDraftInput,
} from "./mail";
