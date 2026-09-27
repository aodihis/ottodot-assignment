import { describe, expect, it } from 'vitest';
import { activeStudentWhere } from '../../src/helpers/students';

describe('activeStudentWhere', () => {
  it('scopes to one parent and excludes removed children', () => {
    expect(activeStudentWhere('parent_1')).toEqual({ parentId: 'parent_1', removedAt: null });
  });
});
