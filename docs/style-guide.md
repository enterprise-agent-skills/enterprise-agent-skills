# Writing style

Skills are read by agents and by people reviewing what agents do. Write for both.

## Voice

- Plain, direct English. Short sentences. Active voice.
- No emoji, no exclamation marks, no marketing words ("powerful", "seamless", "unlock",
  "master", "supercharge", "game-changing").
- Specific over general: name the API, the setting, the error, the number.
- Say when something is uncertain or release-dependent, and how to check it.

## Skills

- Write instructions to the agent in the imperative: "Read data with EML", not "You might
  want to consider reading data with EML".
- Give the reason with each rule so the agent can handle cases the rule does not cover.
- Put the most important rules first. Move long examples to `references/` and link them.
- Cite official documentation and the date you checked it when a fact can change.
- The description has three parts: what the skill does, `USE FOR:` situations, and
  `DO NOT USE FOR:` nearby tasks that belong elsewhere.

## Code samples

- Complete samples start with a file marker line so validators parse them.
- Use placeholders that are obviously fake (`contoso-*`, `<your-secret>`) and never real
  hosts, tenants, keys, or customer data.
- Prefer the pattern you would accept in a code review over the shortest possible example.

## Formatting

- Sentence-case headings.
- Tables for comparisons and reference data; numbered lists for ordered steps.
- One idea per paragraph.
