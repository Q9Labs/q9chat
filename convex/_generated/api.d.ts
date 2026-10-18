/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as deletion from "../deletion.js";
import type * as devices from "../devices.js";
import type * as files from "../files.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_groups from "../lib/groups.js";
import type * as lib_presentation from "../lib/presentation.js";
import type * as lib_reactions from "../lib/reactions.js";
import type * as lib_sniff from "../lib/sniff.js";
import type * as lib_uploads from "../lib/uploads.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_workos from "../lib/workos.js";
import type * as maintenance from "../maintenance.js";
import type * as messages from "../messages.js";
import type * as notificationData from "../notificationData.js";
import type * as notifications from "../notifications.js";
import type * as people from "../people.js";
import type * as profiles from "../profiles.js";
import type * as readStates from "../readStates.js";
import type * as reports from "../reports.js";
import type * as searchData from "../searchData.js";
import type * as typing from "../typing.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  cleanup: typeof cleanup;
  crons: typeof crons;
  deletion: typeof deletion;
  devices: typeof devices;
  files: typeof files;
  groups: typeof groups;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/groups": typeof lib_groups;
  "lib/presentation": typeof lib_presentation;
  "lib/reactions": typeof lib_reactions;
  "lib/sniff": typeof lib_sniff;
  "lib/uploads": typeof lib_uploads;
  "lib/validators": typeof lib_validators;
  "lib/workos": typeof lib_workos;
  maintenance: typeof maintenance;
  messages: typeof messages;
  notificationData: typeof notificationData;
  notifications: typeof notifications;
  people: typeof people;
  profiles: typeof profiles;
  readStates: typeof readStates;
  reports: typeof reports;
  searchData: typeof searchData;
  typing: typeof typing;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
