export const extensionConfigSchemaVersion = 1;

export type ExtensionFeatures = Readonly<Record<string, never>>;

export type ExtensionConfig = Readonly<{
  schemaVersion: typeof extensionConfigSchemaVersion;
  features: ExtensionFeatures;
}>;

export function defineExtensionConfig(
  config: ExtensionConfig,
): ExtensionConfig {
  if (config.schemaVersion !== extensionConfigSchemaVersion) {
    throw new Error(`extension_schema_unsupported: ${config.schemaVersion}`);
  }

  const featureKeys = Object.keys(config.features).sort();
  if (featureKeys.length > 0) {
    throw new Error(`extension_feature_unsupported: ${featureKeys.join(",")}`);
  }

  const rootKeys = Object.keys(config).sort();
  if (rootKeys.join(",") !== "features,schemaVersion") {
    throw new Error(`extension_config_invalid: ${rootKeys.join(",")}`);
  }

  return Object.freeze({
    schemaVersion: extensionConfigSchemaVersion,
    features: Object.freeze({}),
  });
}

export const extensionConfig = defineExtensionConfig({
  schemaVersion: 1,
  features: {},
});
