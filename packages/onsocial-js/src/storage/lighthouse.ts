// src/storage/lighthouse.ts
// Lighthouse-specific implementation details

import fetch from 'cross-fetch';

export const LIGHTHOUSE_API = 'https://api.lighthouse.storage';
export const LIGHTHOUSE_NODE = 'https://node.lighthouse.storage';
export const LIGHTHOUSE_GATEWAY = 'https://gateway.lighthouse.storage';

/**
 * Upload a buffer to Lighthouse
 */
export async function uploadBuffer(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  apiKey: string,
  name?: string,
  onProgress?: (progress: number) => void
): Promise<{ Name: string; Hash: string; Size: string }> {
  const token = 'Bearer ' + apiKey;
  const endpoint = LIGHTHOUSE_NODE + '/api/v0/add?cid-version=1';

  // Ensure we have a proper ArrayBuffer for Blob
  const arrayBuffer =
    buffer instanceof ArrayBuffer
      ? buffer
      : new Uint8Array(buffer).buffer;

  const blob = new Blob([new Uint8Array(arrayBuffer)]);
  const formData = new FormData();
  formData.set('file', blob, name || 'file');

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    const res = (await response.json()) as { error?: string };
    throw new Error(res.error || `Upload failed with status ${response.status}`);
  }

  // Call progress callback at end (streaming progress not available in simple fetch)
  if (onProgress) {
    onProgress(100);
  }

  return (await response.json()) as { Name: string; Hash: string; Size: string };
}

/**
 * Upload text to Lighthouse
 */
export async function uploadText(
  text: string,
  apiKey: string,
  name: string = 'text'
): Promise<{ Name: string; Hash: string; Size: string }> {
  const token = 'Bearer ' + apiKey;
  const endpoint = LIGHTHOUSE_NODE + '/api/v0/add?cid-version=1';

  const blob = new Blob([text], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('file', blob, name);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    const res = (await response.json()) as { error?: string };
    throw new Error(res.error || `Upload failed with status ${response.status}`);
  }

  return (await response.json()) as { Name: string; Hash: string; Size: string };
}

/**
 * Download content from IPFS via gateway
 */
export async function downloadFromGateway(
  cid: string,
  gatewayUrl: string = LIGHTHOUSE_GATEWAY
): Promise<ArrayBuffer> {
  const url = `${gatewayUrl}/ipfs/${cid}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  return response.arrayBuffer();
}

/**
 * Get file info from Lighthouse API
 */
export async function getFileInfo(
  cid: string,
  apiKey: string
): Promise<{
  fileSizeInBytes: string;
  cid: string;
  encryption: boolean;
  fileName: string;
  mimeType: string;
  txHash: string;
}> {
  const response = await fetch(`${LIGHTHOUSE_API}/api/lighthouse/file_info?cid=${cid}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get file info: ${response.status}`);
  }

  return (await response.json()) as {
    fileSizeInBytes: string;
    cid: string;
    encryption: boolean;
    fileName: string;
    mimeType: string;
    txHash: string;
  };
}

/**
 * Get list of uploaded files
 */
export async function getUploads(
  apiKey: string,
  lastKey: string | null = null
): Promise<{
  fileList: Array<{
    publicKey: string;
    fileName: string;
    mimeType: string;
    fileSizeInBytes: string;
    cid: string;
    id: string;
    createdAt: number;
    encryption: boolean;
  }>;
  totalFiles: number;
}> {
  const response = await fetch(
    `${LIGHTHOUSE_API}/api/user/files_uploaded?lastKey=${lastKey || ''}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get uploads: ${response.status}`);
  }

  return (await response.json()) as {
    fileList: Array<{
      publicKey: string;
      fileName: string;
      mimeType: string;
      fileSizeInBytes: string;
      cid: string;
      id: string;
      createdAt: number;
      encryption: boolean;
    }>;
    totalFiles: number;
  };
}

/**
 * Delete a file from Lighthouse
 */
export async function deleteFile(
  apiKey: string,
  fileId: string
): Promise<{ message: string }> {
  const response = await fetch(`${LIGHTHOUSE_API}/api/user/delete_file?id=${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.status}`);
  }

  return (await response.json()) as { message: string };
}

/**
 * Get user's storage balance/usage
 */
export async function getBalance(
  apiKey: string
): Promise<{
  dataLimit: number;
  dataUsed: number;
}> {
  const response = await fetch(`${LIGHTHOUSE_API}/api/user/user_data_usage`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get balance: ${response.status}`);
  }

  const data = (await response.json()) as { dataLimit: number; dataUsed: number };
  return data;
}
