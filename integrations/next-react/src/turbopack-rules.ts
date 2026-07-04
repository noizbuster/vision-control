export type TurbopackLoaderItem =
  | string
  | {
      readonly loader: string;
      readonly options: Record<string, unknown>;
    };

export type TurbopackRule = {
  readonly loaders: readonly TurbopackLoaderItem[];
  readonly as?: string;
};

export type TurbopackConfig = {
  readonly rules?: Record<string, TurbopackRule>;
  readonly resolveAlias?: Record<string, unknown>;
  readonly resolveExtensions?: readonly string[];
  readonly root?: string;
  readonly moduleIds?: "named" | "deterministic";
};

const buildTurbopackMarkerRules = (params: {
  readonly loaderPath: string;
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}): Record<string, TurbopackRule> => {
  const loaderItem: TurbopackLoaderItem = {
    loader: params.loaderPath,
    options: {
      workspaceRoot: params.workspaceRoot,
      include: [...params.include],
      exclude: [...params.exclude],
    },
  };
  const rule: TurbopackRule = { loaders: [loaderItem] };
  return { "*.tsx": rule, "*.jsx": rule };
};

const mergeTurbopackConfig = (
  existing: TurbopackConfig | undefined,
  markerRules: Record<string, TurbopackRule>,
): TurbopackConfig => ({
  ...(existing ?? {}),
  rules: {
    ...(existing?.rules ?? {}),
    ...markerRules,
  },
});

export const configureTurbopackMarkers = (params: {
  readonly loaderPath: string;
  readonly workspaceRoot: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly existing: TurbopackConfig | undefined;
}): TurbopackConfig => mergeTurbopackConfig(params.existing, buildTurbopackMarkerRules(params));
