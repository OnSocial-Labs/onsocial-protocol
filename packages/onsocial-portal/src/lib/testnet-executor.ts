export interface ExecutionResult {
  success: boolean;
  output: string;
  txHash?: string;
  error?: string;
  actionLabel?: string;
}

export async function executeOnTestnet(
  code: string,
  accountId: string,
  wallet: any
): Promise<ExecutionResult> {
  try {
    // Extract function name and arguments from code
    const contractMatch = code.match(
      /contract\.(set|get|call|view)\(([^)]+)\)/
    );
    if (!contractMatch) {
      return {
        success: false,
        output: '❌ Could not parse contract call from code',
        error: 'Invalid code format. Expected contract.method(...) pattern.',
      };
    }

    // contractMatch[1] = method, contractMatch[2] = argsStr (used implicitly via code.includes below)

    // For demo, let's handle specific OnSocial methods
    if (code.includes('profile')) {
      return await executeSetProfile(wallet, accountId);
    } else if (code.includes('standing') || code.includes('Stand')) {
      return await executeStandWith(wallet, accountId);
    } else if (code.includes('reaction') || code.includes('React')) {
      return await executeReaction(wallet, accountId);
    } else if (code.includes('post') || code.includes('Post')) {
      return await executeCreatePost(wallet, accountId);
    }

    return {
      success: false,
      output:
        '⚠️ This example is not yet implemented for testnet execution.\n\nCurrently supported:\n• Create/Update Profile\n• Create Post\n• Stand With User\n• React to Post\n\nMore examples coming soon!',
    };
  } catch (error: any) {
    return {
      success: false,
      output: `❌ Execution failed:\n\n${error.message}`,
      error: error.message,
    };
  }
}

async function executeSetProfile(
  wallet: any,
  accountId: string
): Promise<ExecutionResult> {
  try {
    const result = await wallet.signAndSendTransaction({
      receiverId: 'core-onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'execute',
            args: {
              request: {
                action: {
                  type: 'set',
                  data: {
                    'profile/name': accountId.split('.')[0],
                    'profile/bio': 'Testing OnSocial Protocol',
                  },
                },
                options: { refund_unused_deposit: true },
              },
            },
            gas: '50000000000000',
            deposit: '10000000000000000000000', // 0.01 NEAR
          },
        },
      ],
    });

    return {
      success: true,
      output: `✅ Profile updated successfully!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nAccount: ${accountId}`,
      txHash: result?.transaction?.hash,
      actionLabel: 'Profile update',
    };
  } catch (error: any) {
    return {
      success: false,
      output: `❌ Failed to update profile:\n\n${error.message}`,
      error: error.message,
    };
  }
}

async function executeCreatePost(
  wallet: any,
  accountId: string
): Promise<ExecutionResult> {
  try {
    const postId = Date.now().toString();
    const result = await wallet.signAndSendTransaction({
      receiverId: 'core-onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'execute',
            args: {
              request: {
                action: {
                  type: 'set',
                  data: {
                    [`post/${postId}`]: JSON.stringify({
                      text: 'Hello from OnSocial Playground! 🚀',
                      access: 'public',
                      timestamp: Date.now(),
                    }),
                  },
                },
                options: { refund_unused_deposit: true },
              },
            },
            gas: '50000000000000',
            deposit: '10000000000000000000000',
          },
        },
      ],
    });

    return {
      success: true,
      output: `✅ Post created successfully!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nAccount: ${accountId}\nPost ID: ${postId}`,
      txHash: result?.transaction?.hash,
      actionLabel: 'Post creation',
    };
  } catch (error: any) {
    return {
      success: false,
      output: `❌ Failed to create post:\n\n${error.message}`,
      error: error.message,
    };
  }
}

async function executeStandWith(
  wallet: any,
  accountId: string
): Promise<ExecutionResult> {
  try {
    const target = 'test-user.testnet';
    const result = await wallet.signAndSendTransaction({
      receiverId: 'core-onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'execute',
            args: {
              request: {
                action: {
                  type: 'set',
                  data: {
                    [`standing/${target}`]: JSON.stringify({
                      since: Date.now(),
                    }),
                  },
                },
                options: { refund_unused_deposit: true },
              },
            },
            gas: '50000000000000',
            deposit: '10000000000000000000000',
          },
        },
      ],
    });

    return {
      success: true,
      output: `✅ Now standing with ${target}!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nYou: ${accountId}\nStanding with: ${target}`,
      txHash: result?.transaction?.hash,
      actionLabel: 'Stand with user',
    };
  } catch (error: any) {
    return {
      success: false,
      output: `❌ Failed to stand with user:\n\n${error.message}`,
      error: error.message,
    };
  }
}

async function executeReaction(
  wallet: any,
  accountId: string
): Promise<ExecutionResult> {
  try {
    const postOwner = 'test-user.testnet';
    const postId = 'example_post_1';
    const result = await wallet.signAndSendTransaction({
      receiverId: 'core-onsocial.testnet',
      actions: [
        {
          type: 'FunctionCall',
          params: {
            methodName: 'execute',
            args: {
              request: {
                action: {
                  type: 'set',
                  data: {
                    [`reaction/${postOwner}/post/${postId}`]: JSON.stringify({
                      type: 'like',
                    }),
                  },
                },
                options: { refund_unused_deposit: true },
              },
            },
            gas: '50000000000000',
            deposit: '10000000000000000000000',
          },
        },
      ],
    });

    return {
      success: true,
      output: `✅ Reacted to post!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nYou: ${accountId}\nPost: ${postOwner}/post/${postId}`,
      txHash: result?.transaction?.hash,
      actionLabel: 'Reaction',
    };
  } catch (error: any) {
    return {
      success: false,
      output: `❌ Failed to react to post:\n\n${error.message}`,
      error: error.message,
    };
  }
}
