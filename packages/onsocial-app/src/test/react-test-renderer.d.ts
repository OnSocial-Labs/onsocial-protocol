declare module 'react-test-renderer' {
  import type { ReactElement, ReactNode } from 'react';

  export interface ReactTestInstance {
    type: unknown;
    props: {
      children?: ReactNode;
      onClick?: () => void;
      'data-guild-filter'?: string;
      'data-embedded'?: string;
    };
    findByType(type: string): ReactTestInstance;
    findAllByType(type: string): ReactTestInstance[];
    findAll(
      predicate: (node: ReactTestInstance) => boolean
    ): ReactTestInstance[];
  }

  export interface ReactTestRenderer {
    toJSON(): unknown;
    update(element: ReactElement): void;
    root: ReactTestInstance;
  }

  export function create(element: ReactElement): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
