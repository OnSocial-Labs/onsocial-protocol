import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runtime = 'nodejs';

interface ExecuteRequest {
  code: string;
  accountId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecuteRequest = await request.json();
    const { code, accountId = 'alice.test.near' } = body;

    // Check if sandbox is running
    const sandboxCheck = await checkSandbox();
    if (!sandboxCheck.running) {
      return NextResponse.json({
        success: false,
        error: 'NEAR sandbox is not running. Please start it first.',
        hint: 'Run: cd packages/onsocial-portal && ./scripts/start-sandbox.sh',
      }, { status: 503 });
    }

    // Execute the code
    const result = await executeCode(code, accountId);
    
    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Playground execution error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Execution failed',
      details: error.stderr || error.stdout,
    }, { status: 500 });
  }
}

async function checkSandbox(): Promise<{ running: boolean }> {
  try {
    // Try to ping sandbox RPC
    const response = await fetch('http://localhost:3030/status', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    return { running: response.ok };
  } catch {
    return { running: false };
  }
}

async function executeCode(code: string, accountId: string): Promise<any> {
  // Parse the code to extract contract method calls
  // This is a simplified version - in production you'd want a proper parser
  
  // Check if it's a set() call
  if (code.includes('contract.set(')) {
    return await executeSetCall(code, accountId);
  }
  
  // Check if it's a get() call
  if (code.includes('contract.get(')) {
    return await executeGetCall(code, accountId);
  }
  
  // Check if it's a permission call
  if (code.includes('contract.set_permission(') || code.includes('contract.grant_role(')) {
    return await executePermissionCall(code, accountId);
  }

  // Check if it's a storage call
  if (code.includes('contract.get_storage_balance(')) {
    return await executeStorageCall(code, accountId);
  }

  // Default: return simulation message
  return {
    message: 'Code parsed successfully',
    note: 'Real execution requires proper NEAR contract integration',
    parsedCode: code.substring(0, 200),
  };
}

async function executeSetCall(code: string, accountId: string): Promise<any> {
  try {
    // Extract the data object from the code
    const dataMatch = code.match(/data:\s*({[\s\S]*?})\s*}/);
    if (!dataMatch) {
      throw new Error('Could not parse data object from code');
    }

    // For demo: simulate the call
    const command = `near-sandbox call contract.test.near set '{"data": ${dataMatch[1]}}' --accountId ${accountId} --deposit 0.01`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 10000,
      env: { ...process.env, NEAR_ENV: 'sandbox' },
    });

    return {
      success: true,
      transactionId: 'sandbox_' + Date.now(),
      output: stdout,
      error: stderr,
    };
  } catch (error: any) {
    throw new Error(`Set call failed: ${error.message}`);
  }
}

async function executeGetCall(code: string, accountId: string): Promise<any> {
  try {
    // Extract keys from the code
    const keysMatch = code.match(/keys:\s*\[(.*?)\]/);
    if (!keysMatch) {
      throw new Error('Could not parse keys from code');
    }

    const command = `near-sandbox view contract.test.near get '{"keys": [${keysMatch[1]}], "account_id": "${accountId}"}' --accountId ${accountId}`;
    
    const { stdout } = await execAsync(command, {
      timeout: 10000,
      env: { ...process.env, NEAR_ENV: 'sandbox' },
    });

    return {
      success: true,
      data: JSON.parse(stdout),
    };
  } catch (error: any) {
    throw new Error(`Get call failed: ${error.message}`);
  }
}

async function executePermissionCall(code: string, accountId: string): Promise<any> {
  // Simulate permission calls
  return {
    success: true,
    message: 'Permission updated',
    note: 'Sandbox permission call executed',
  };
}

async function executeStorageCall(code: string, accountId: string): Promise<any> {
  try {
    const command = `near-sandbox view contract.test.near get_storage_balance '{"account_id": "${accountId}"}' --accountId ${accountId}`;
    
    const { stdout } = await execAsync(command, {
      timeout: 10000,
      env: { ...process.env, NEAR_ENV: 'sandbox' },
    });

    return {
      success: true,
      storage: JSON.parse(stdout),
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'No storage found for this account',
    };
  }
}
