export interface E2eViewport {
  readonly width: number;
  readonly height: number;
  readonly label: `${number}x${number}`;
}

const DEFAULT_VIEWPORT = "1280x720";
const VIEWPORT_PATTERN = /^(?<width>[1-9]\d{1,3})x(?<height>[1-9]\d{1,3})$/;

export function parseE2eViewport(value: string | undefined): E2eViewport {
  const label = value ?? DEFAULT_VIEWPORT;
  const match = VIEWPORT_PATTERN.exec(label);
  const width = Number(match?.groups?.width);
  const height = Number(match?.groups?.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new Error(`VC_E2E_VIEWPORT must be WIDTHxHEIGHT, received ${JSON.stringify(label)}`);
  }
  return { width, height, label: `${width}x${height}` };
}
