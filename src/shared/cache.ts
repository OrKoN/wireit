export interface Cache {
  getOutputs(
    packageJsonPath: string,
    taskName: string,
    cacheKey: string,
    taskOutputGlobs: string[]
  ): Promise<CachedOutput | undefined>;

  saveOutputs(
    packageJsonPath: string,
    taskName: string,
    cacheKey: string,
    taskOutputGlobs: string[]
  ): Promise<void>;
}

export interface CachedOutput {
  apply(): Promise<void>;
}