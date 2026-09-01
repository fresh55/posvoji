// Compatibility facade for existing callers. The portal integration is split
// by responsibility so its wire contract, transport, merge, and audit report
// can evolve and be tested independently.
export * from "./portal-contract";
export * from "./portal-listings-contract";
export * from "./portal-client";
export * from "./portal-merge";
export * from "./portal-report";
