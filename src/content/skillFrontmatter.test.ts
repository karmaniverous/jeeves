import { describe, expect, it } from 'vitest';

import { validateSkillFrontmatter } from './skillFrontmatter.js';

describe('validateSkillFrontmatter', () => {
  it('parses inline scalars and strips quotes', () => {
    expect(
      validateSkillFrontmatter(
        '---\nname: foo\ndescription: "Does foo things."\n---\n# Foo\n',
      ),
    ).toEqual({ name: 'foo', description: 'Does foo things.' });
  });

  it('folds block scalars', () => {
    const content = [
      '---',
      'name: bar',
      'description: >',
      '  Line one',
      '  line two.',
      '---',
      'Body',
    ].join('\n');
    expect(validateSkillFrontmatter(content).description).toBe(
      'Line one line two.',
    );
  });

  it('handles CRLF line endings', () => {
    expect(
      validateSkillFrontmatter('---\r\nname: a\r\ndescription: b\r\n---\r\n'),
    ).toEqual({ name: 'a', description: 'b' });
  });

  it.each([
    ['# No frontmatter', 'missing YAML frontmatter'],
    ['---\ndescription: x\n---\n', 'missing "name"'],
    ['---\nname: x\n---\n', 'missing "description"'],
    ['---\nname: x\ndescription: >\n---\n', 'missing "description"'],
  ])('rejects %j', (content, message) => {
    expect(() => validateSkillFrontmatter(content)).toThrow(message);
  });
});
