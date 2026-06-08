export interface RefSwapFunctionCall {
  methodName: string;
  args?: Record<string, unknown>;
  gas?: string;
  amount?: string;
}

export interface RefSwapTransaction {
  receiverId: string;
  functionCalls: RefSwapFunctionCall[];
}
