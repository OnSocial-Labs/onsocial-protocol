export interface ExecutionResult {
	success: boolean
	output: string
	txHash?: string
	error?: string
}

export async function executeOnTestnet(
	code: string,
	accountId: string,
	wallet: any
): Promise<ExecutionResult> {
	try {
		
		// Extract function name and arguments from code
		const contractMatch = code.match(/contract\.(set|get|call|view)\(([^)]+)\)/)
		if (!contractMatch) {
			return {
				success: false,
				output: '❌ Could not parse contract call from code',
				error: 'Invalid code format. Expected contract.method(...) pattern.',
			}
		}

		const [, method, argsStr] = contractMatch
		
		// For demo, let's handle specific OnSocial methods
		if (code.includes('createProfile')) {
			return await executeCreateProfile(wallet, accountId)
		} else if (code.includes('createPost')) {
			return await executeCreatePost(wallet, accountId)
		} else if (code.includes('followUser')) {
			return await executeFollowUser(wallet, accountId)
		} else if (code.includes('likePost')) {
			return await executeLikePost(wallet, accountId)
		}

		return {
			success: false,
			output: '⚠️ This example is not yet implemented for testnet execution.\n\nCurrently supported:\n• createProfile\n• createPost\n• followUser\n• likePost\n\nMore examples coming soon!',
		}
	} catch (error: any) {
		return {
			success: false,
			output: `❌ Execution failed:\n\n${error.message}`,
			error: error.message,
		}
	}
}

async function executeCreateProfile(wallet: any, accountId: string): Promise<ExecutionResult> {
	try {
		const result = await wallet.signAndSendTransaction({
			receiverId: 'core-onsocial.testnet',
			actions: [
				{
					type: 'FunctionCall',
					params: {
						methodName: 'create_profile',
						args: {
							username: accountId.split('.')[0],
							bio: 'Testing OnSocial Protocol',
							avatar: 'https://via.placeholder.com/150',
						},
						gas: '30000000000000',
						deposit: '1000000000000000000000000', // 1 NEAR for storage
					},
				},
			],
		})

		return {
			success: true,
			output: `✅ Profile created successfully!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nAccount: ${accountId}\n\nYour profile has been created on NEAR testnet.`,
			txHash: result?.transaction?.hash,
		}
	} catch (error: any) {
		return {
			success: false,
			output: `❌ Failed to create profile:\n\n${error.message}`,
			error: error.message,
		}
	}
}

async function executeCreatePost(wallet: any, accountId: string): Promise<ExecutionResult> {
	try {
		const result = await wallet.signAndSendTransaction({
			receiverId: 'core-onsocial.testnet',
			actions: [
				{
					type: 'FunctionCall',
					params: {
						methodName: 'create_post',
						args: {
							content: 'Hello from OnSocial Playground! 🚀',
							media: [],
							visibility: 'public',
						},
						gas: '30000000000000',
						deposit: '100000000000000000000000', // 0.1 NEAR
					},
				},
			],
		})

		return {
			success: true,
			output: `✅ Post created successfully!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nAccount: ${accountId}\n\nYour post is now on NEAR testnet.`,
			txHash: result?.transaction?.hash,
		}
	} catch (error: any) {
		return {
			success: false,
			output: `❌ Failed to create post:\n\n${error.message}`,
			error: error.message,
		}
	}
}

async function executeFollowUser(wallet: any, accountId: string): Promise<ExecutionResult> {
	try {
		const result = await wallet.signAndSendTransaction({
			receiverId: 'core-onsocial.testnet',
			actions: [
				{
					type: 'FunctionCall',
					params: {
						methodName: 'follow',
						args: {
							account_id: 'test-user.testnet',
						},
						gas: '30000000000000',
						deposit: '0',
					},
				},
			],
		})

		return {
			success: true,
			output: `✅ Follow action successful!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nYou: ${accountId}\nFollowing: test-user.testnet`,
			txHash: result?.transaction?.hash,
		}
	} catch (error: any) {
		return {
			success: false,
			output: `❌ Failed to follow user:\n\n${error.message}`,
			error: error.message,
		}
	}
}

async function executeLikePost(wallet: any, accountId: string): Promise<ExecutionResult> {
	try {
		const result = await wallet.signAndSendTransaction({
			receiverId: 'core-onsocial.testnet',
			actions: [
				{
					type: 'FunctionCall',
					params: {
						methodName: 'like_post',
						args: {
							post_id: 'example_post_1',
						},
						gas: '30000000000000',
						deposit: '0',
					},
				},
			],
		})

		return {
			success: true,
			output: `✅ Post liked successfully!\n\nTransaction: ${result?.transaction?.hash || 'N/A'}\nYou: ${accountId}\nPost: example_post_1`,
			txHash: result?.transaction?.hash,
		}
	} catch (error: any) {
		return {
			success: false,
			output: `❌ Failed to like post:\n\n${error.message}`,
			error: error.message,
		}
	}
}
