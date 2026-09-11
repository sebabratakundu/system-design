export interface ISagaStep<TContext> {
  readonly stepName: string;
  execute(context: TContext): Promise<void>;
  compensate(context: TContext): Promise<void>;
}
