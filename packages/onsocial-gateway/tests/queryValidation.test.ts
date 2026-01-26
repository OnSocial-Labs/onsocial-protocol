import { describe, it, expect } from 'vitest';
import { validateQuery, QUERY_LIMITS } from '../src/middleware/queryValidation.js';

describe('Query Validation', () => {
  describe('Query Depth', () => {
    it('should allow shallow queries for free tier', () => {
      const query = `{
        storageUpdates {
          account_id
          key
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(true);
    });
    
    it('should reject deep queries for free tier', () => {
      // Depth 5 query (exceeds free tier limit of 3)
      const query = `{
        storageUpdates {
          account_id
          nested1 {
            nested2 {
              nested3 {
                nested4 {
                  value
                }
              }
            }
          }
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('depth');
    });
    
    it('should allow deeper queries for staker tier', () => {
      const query = `{
        storageUpdates {
          account_id
          level1 {
            level2 {
              level3 {
                value
              }
            }
          }
        }
      }`;
      
      const result = validateQuery(query, 'staker');
      expect(result.valid).toBe(true);
    });
    
    it('should allow deep queries for builder tier', () => {
      const query = `{
        a { b { c { d { e { f { g { value } } } } } } }
      }`;
      
      const result = validateQuery(query, 'builder');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Aggregations', () => {
    it('should reject aggregations for free tier', () => {
      const query = `{
        storageUpdates_aggregate {
          aggregate {
            count
          }
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Aggregation');
    });
    
    it('should allow aggregations for staker tier', () => {
      const query = `{
        storageUpdates_aggregate {
          aggregate {
            count
          }
        }
      }`;
      
      const result = validateQuery(query, 'staker');
      expect(result.valid).toBe(true);
    });
    
    it('should allow aggregations for builder tier', () => {
      const query = `{
        storageUpdates_aggregate {
          aggregate {
            count
            max { block_height }
          }
        }
      }`;
      
      const result = validateQuery(query, 'builder');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Row Limits', () => {
    it('should reject excessive limits for free tier', () => {
      const query = `{
        storageUpdates(limit: 500) {
          account_id
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('limit');
      expect(result.error).toContain('100'); // free tier max
    });
    
    it('should allow reasonable limits for free tier', () => {
      const query = `{
        storageUpdates(limit: 50) {
          account_id
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(true);
    });
    
    it('should allow higher limits for staker tier', () => {
      const query = `{
        storageUpdates(limit: 500) {
          account_id
        }
      }`;
      
      const result = validateQuery(query, 'staker');
      expect(result.valid).toBe(true);
    });
    
    it('should reject limits exceeding staker tier', () => {
      const query = `{
        storageUpdates(limit: 5000) {
          account_id
        }
      }`;
      
      const result = validateQuery(query, 'staker');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1000'); // staker tier max
    });
    
    it('should allow large limits for builder tier', () => {
      const query = `{
        storageUpdates(limit: 5000) {
          account_id
        }
      }`;
      
      const result = validateQuery(query, 'builder');
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Query Complexity', () => {
    it('should track complexity details', () => {
      const query = `{
        storageUpdates(limit: 10, where: { account_id: { _eq: "test" } }) {
          account_id
          key
          value_cid
          timestamp
        }
      }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details?.complexity).toBeGreaterThan(0);
    });
    
    it('should reject overly complex queries for free tier', () => {
      // Generate a very complex query (many fields)
      const fields = Array(100).fill('field').map((f, i) => `${f}${i}`).join(' ');
      const query = `{ storageUpdates { ${fields} } }`;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('complexity');
    });
  });
  
  describe('Invalid Queries', () => {
    it('should reject invalid GraphQL syntax', () => {
      const query = `{ this is not valid graphql `;
      
      const result = validateQuery(query, 'free');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid GraphQL');
    });
  });
  
  describe('Query Limits Configuration', () => {
    it('should have correct free tier limits', () => {
      expect(QUERY_LIMITS.free.maxDepth).toBe(3);
      expect(QUERY_LIMITS.free.maxRowLimit).toBe(100);
      expect(QUERY_LIMITS.free.allowAggregations).toBe(false);
    });
    
    it('should have correct staker tier limits', () => {
      expect(QUERY_LIMITS.staker.maxDepth).toBe(5);
      expect(QUERY_LIMITS.staker.maxRowLimit).toBe(1000);
      expect(QUERY_LIMITS.staker.allowAggregations).toBe(true);
    });
    
    it('should have correct builder tier limits', () => {
      expect(QUERY_LIMITS.builder.maxDepth).toBe(8);
      expect(QUERY_LIMITS.builder.maxRowLimit).toBe(10000);
      expect(QUERY_LIMITS.builder.allowAggregations).toBe(true);
    });
  });
});
