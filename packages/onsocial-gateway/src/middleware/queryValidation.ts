import { parse, visit, DocumentNode, Kind } from 'graphql';
import type { Request, Response, NextFunction } from 'express';
import type { Tier } from '../types/index.js';
import { config } from '../config/index.js';

interface TierLimits {
  maxDepth: number;
  maxComplexity: number;
  maxRowLimit: number;
  allowAggregations: boolean;
}

/**
 * Query limits per tier
 * Production-ready defense against expensive queries
 */
export const QUERY_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxDepth: 3,           // Shallow queries only
    maxComplexity: 50,     // Simple queries
    maxRowLimit: 100,      // Small result sets
    allowAggregations: false,
  },
  pro: {
    maxDepth: 8,           // Deep nesting allowed
    maxComplexity: 1000,   // Complex queries allowed
    maxRowLimit: 10000,    // Large result sets
    allowAggregations: true,
  },
  scale: {
    maxDepth: 12,          // Deepest nesting
    maxComplexity: 5000,   // Heavy analytics
    maxRowLimit: 50000,    // Bulk exports
    allowAggregations: true,
  },
};

/**
 * Calculate query complexity based on:
 * - Number of fields selected
 * - Depth of nesting
 * - Presence of expensive operations (aggregations, connections)
 */
function calculateComplexity(ast: DocumentNode): number {
  let complexity = 0;
  
  visit(ast, {
    Field: {
      enter(node) {
        complexity += 1;
        
        // Aggregation fields are more expensive
        const fieldName = node.name.value;
        if (fieldName.endsWith('_aggregate') || fieldName === 'aggregate') {
          complexity += 10;
        }
        
        // Connection fields (pagination) add complexity
        if (fieldName.includes('connection') || fieldName.includes('Connection')) {
          complexity += 5;
        }
      },
    },
    // Arguments add complexity
    Argument: {
      enter() {
        complexity += 0.5;
      },
    },
  });
  
  return Math.ceil(complexity);
}

/**
 * Calculate query depth
 */
function calculateDepth(ast: DocumentNode): number {
  let maxDepth = 0;
  
  function traverse(node: any, currentDepth: number) {
    if (node.kind === Kind.FIELD) {
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    
    if (node.selectionSet?.selections) {
      for (const selection of node.selectionSet.selections) {
        traverse(selection, currentDepth + 1);
      }
    }
  }
  
  for (const definition of ast.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      traverse(definition, 0);
    }
  }
  
  return maxDepth;
}

/**
 * Check if query contains aggregation operations
 */
function hasAggregations(ast: DocumentNode): boolean {
  let found = false;
  
  visit(ast, {
    Field: {
      enter(node) {
        const fieldName = node.name.value;
        if (fieldName.endsWith('_aggregate') || fieldName === 'aggregate') {
          found = true;
        }
      },
    },
  });
  
  return found;
}

/**
 * Extract limit from query arguments
 */
function extractLimit(ast: DocumentNode): number | null {
  let limit: number | null = null;
  
  visit(ast, {
    Argument: {
      enter(node) {
        if (node.name.value === 'limit' && node.value.kind === Kind.INT) {
          limit = parseInt((node.value as any).value, 10);
        }
      },
    },
  });
  
  return limit;
}

export interface QueryValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    depth: number;
    complexity: number;
    hasAggregations: boolean;
    requestedLimit: number | null;
  };
}

/**
 * Validate a GraphQL query against tier limits
 */
export function validateQuery(query: string, tier: Tier): QueryValidationResult {
  const limits = QUERY_LIMITS[tier];
  
  try {
    const ast = parse(query);
    
    const depth = calculateDepth(ast);
    const complexity = calculateComplexity(ast);
    const queryHasAggregations = hasAggregations(ast);
    const requestedLimit = extractLimit(ast);
    
    const details = {
      depth,
      complexity,
      hasAggregations: queryHasAggregations,
      requestedLimit,
    };
    
    // Check depth
    if (depth > limits.maxDepth) {
      return {
        valid: false,
        error: `Query depth ${depth} exceeds limit ${limits.maxDepth} for ${tier} tier`,
        details,
      };
    }
    
    // Check complexity
    if (complexity > limits.maxComplexity) {
      return {
        valid: false,
        error: `Query complexity ${complexity} exceeds limit ${limits.maxComplexity} for ${tier} tier`,
        details,
      };
    }
    
    // Check aggregations
    if (queryHasAggregations && !limits.allowAggregations) {
      return {
        valid: false,
        error: `Aggregation queries not allowed for ${tier} tier. Upgrade to pro tier.`,
        details,
      };
    }
    
    // Check row limit
    if (requestedLimit && requestedLimit > limits.maxRowLimit) {
      return {
        valid: false,
        error: `Requested limit ${requestedLimit} exceeds maximum ${limits.maxRowLimit} for ${tier} tier`,
        details,
      };
    }
    
    return { valid: true, details };
    
  } catch (parseError: any) {
    return {
      valid: false,
      error: `Invalid GraphQL query: ${parseError.message}`,
    };
  }
}

/**
 * Express middleware for query validation
 */
export function queryValidationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip validation for GET requests (like /limits endpoint)
  if (req.method === 'GET') {
    next();
    return;
  }
  
  const query = req.body?.query;
  
  // Skip validation for introspection queries (needed for tools)
  if (query && query.includes('__schema')) {
    next();
    return;
  }
  
  if (!query) {
    next();
    return;
  }
  
  const tier: Tier = req.auth?.tier || 'free';
  const result = validateQuery(query, tier);
  
  if (!result.valid) {
    res.status(400).json({
      error: 'Query validation failed',
      message: result.error,
      tier,
      limits: QUERY_LIMITS[tier],
      details: result.details,
    });
    return;
  }
  
  // Attach validation details to request for logging
  (req as any).queryValidation = result.details;
  
  next();
}
