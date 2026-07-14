/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as agentTools from "../agentTools.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as email_index from "../email/index.js";
import type * as email_reservationActions from "../email/reservationActions.js";
import type * as email_reservationEvents from "../email/reservationEvents.js";
import type * as email_templates_subscriptionEmail from "../email/templates/subscriptionEmail.js";
import type * as email_validators from "../email/validators.js";
import type * as engine_adminBooking from "../engine/adminBooking.js";
import type * as engine_availability from "../engine/availability.js";
import type * as engine_identity from "../engine/identity.js";
import type * as engine_lifecycle from "../engine/lifecycle.js";
import type * as engine_policy from "../engine/policy.js";
import type * as engine_waitlist from "../engine/waitlist.js";
import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as jeomwonSeed from "../jeomwonSeed.js";
import type * as qaReset from "../qaReset.js";
import type * as reservationEmailScheduler from "../reservationEmailScheduler.js";
import type * as subscriptions from "../subscriptions.js";
import type * as users from "../users.js";
import type * as utils_validators from "../utils/validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  agentTools: typeof agentTools;
  auth: typeof auth;
  chat: typeof chat;
  "email/index": typeof email_index;
  "email/reservationActions": typeof email_reservationActions;
  "email/reservationEvents": typeof email_reservationEvents;
  "email/templates/subscriptionEmail": typeof email_templates_subscriptionEmail;
  "email/validators": typeof email_validators;
  "engine/adminBooking": typeof engine_adminBooking;
  "engine/availability": typeof engine_availability;
  "engine/identity": typeof engine_identity;
  "engine/lifecycle": typeof engine_lifecycle;
  "engine/policy": typeof engine_policy;
  "engine/waitlist": typeof engine_waitlist;
  env: typeof env;
  http: typeof http;
  init: typeof init;
  jeomwonSeed: typeof jeomwonSeed;
  qaReset: typeof qaReset;
  reservationEmailScheduler: typeof reservationEmailScheduler;
  subscriptions: typeof subscriptions;
  users: typeof users;
  "utils/validators": typeof utils_validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
