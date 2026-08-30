import { describe, expect, it } from "vitest";
import { z } from "zod";
import contract from "../fixtures/portal-export.contract.json";
import {
  BaselineFields,
  OverrideFields,
  PortalExportPayload,
} from "./portal-contract";

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

function valuesByField(): Map<string, Set<string>> {
  const values = new Map<string, Set<string>>();
  for (const override of contract.export.overrides) {
    for (const [field, value] of Object.entries(override.fields)) {
      const fieldValues = values.get(field) ?? new Set<string>();
      fieldValues.add(String(value));
      values.set(field, fieldValues);
    }
  }
  return values;
}

function enumOptions(field: unknown): readonly string[] | undefined {
  if (field instanceof z.ZodOptional || field instanceof z.ZodNullable) {
    return enumOptions(field.unwrap());
  }
  return field instanceof z.ZodEnum
    ? field.options.map((value) => String(value))
    : undefined;
}

describe("Django portal export contract", () => {
  it("accepts the exhaustive export produced by Django", () => {
    expect(PortalExportPayload.safeParse(contract.export).success).toBe(true);
  });

  it("keeps the override field names identical", () => {
    expect(sorted(Object.keys(OverrideFields.shape))).toEqual(
      sorted(contract.fieldNames),
    );
  });

  it("keeps every enum domain identical", () => {
    const validatorEnums = Object.fromEntries(
      Object.entries(OverrideFields.shape).flatMap(([field, schema]) => {
        const options = enumOptions(schema);
        return options ? [[field, sorted(options)]] : [];
      }),
    );
    const portalEnums = Object.fromEntries(
      Object.entries(contract.enumValues).map(([field, values]) => [
        field,
        sorted(values),
      ]),
    );

    expect(validatorEnums).toEqual(portalEnums);

    const samples = valuesByField();
    for (const [field, options] of Object.entries(portalEnums)) {
      expect(sorted(samples.get(field) ?? [])).toEqual(options);
    }
  });

  it("keeps crawled unknown status valid only in the baseline", () => {
    expect(BaselineFields.safeParse({ status: "unknown" }).success).toBe(true);
    expect(OverrideFields.safeParse({ status: "unknown" }).success).toBe(false);
  });
});
