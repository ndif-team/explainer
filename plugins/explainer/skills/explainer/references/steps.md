# Planning the steps

## Two lists first

Write two short lists before anything else.

- **What the reader knows.** From their answers. Be specific: "has trained a
  transformer, has not seen this model" tells you where to start; "technical" does not.
- **What they should know at the end.** Two or three sentences they could repeat.

The explainer is the shortest path from the first list to the second. Anything
that is on neither list and is not needed to connect them stays out.

## Start on familiar ground

The first content step shows something from the first list, drawn the way the rest
of the page will draw things. To explain a key-value cache, first draw generation
without one: the model reading the whole prompt again for every new token. Later
steps change that picture, so the reader always sees what is new against what
they knew.

## Order the ideas

List every idea and term the takeaways depend on. Order the list so that each item
needs only the items above it. That list is the outline.

- **One new idea per step.** If a caption needs "and also", it is two steps.
- **Show a thing before you use its name.** A step may use a term only after an
  earlier step's picture contained the thing. A caption that says "the cache
  stores each token's keys and values" has used "keys and values" without showing
  them. The fix is an earlier step that shows what attention reads from a token,
  and only then the step that stores it.
- **What it is, then how it works, then what it changes.** Show a part from the
  outside before opening it.
- **One difference at a time.** When the subject differs from the familiar thing
  in three ways, give each difference its own scene, and say so when you set one
  aside: "Set batching aside for a moment."
- **A worked case before the rule.** Show one new token reading four stored
  tokens, then say that every later token does the same.
- **Bring it back together.** After the parts have each had a scene, one step
  shows them working at once.

Group the steps into scenes of two to six. A scene develops one idea, and its
one- to three-word name appears above each caption.

## Open and close on the same picture

Step 1 is a title step: the name, one sentence on what the reader will understand,
and the finished picture, which they cannot read yet. The last step shows that
picture again, replayed from the start. Now they can read it.

## Length

As many steps as there are ideas. Most explainers have 12 to 25. Cut a step that
restates the one before it. When the list passes 30, the topic is two explainers
or the reader needs less than you planned.

## Captions

Each step has a heading, a body, and sometimes a note.

- **Heading: the point of the step, as a claim.** "Each new token reruns the whole
  prompt", not "Generation". Under 64 characters.
- **Body: one or two short sentences** on what the picture now shows. Under 300
  characters.
- **Note: one aside**, in smaller type: a number, a limit, "these are example
  values", or what comes next. Leave it out when there is nothing to add.

Write the way you would say it to a colleague at a whiteboard.

- Use the reader's words. A name from the source code appears only if the reader
  will meet it, in backticks, after a step has shown what it names.
- State things directly. No rhetorical questions, no "it's not X, it's Y", no
  asides between dashes, no praise for the subject.
- Do not narrate the page ("in this step we will see"). Do not describe the
  picture piece by piece: if the caption has to, the picture needs fixing.
- Real numbers come from the source. Round them the way the source does.

## The outline to show the user

One line per step, grouped by scene, each with what the picture shows:

```text
Start
 1. How a KV cache works                           [the finished picture: a new token reading stored rows]

Generation without a cache
 2. A model writes one token at a time             [prompt in, one token out, appended, again]
 3. Each new token reruns the whole prompt         [every token lights up again at each step; a counter of tokens computed]

What attention needs
 4. Attention reads a key and a value per token    [one layer: the new token's query against earlier tokens' keys]
 5. An earlier token's keys and values never change [the same rows at two steps, side by side, identical]

The cache
 6. So store them once                             [rows written to a table as each token is first computed]
 7. A new token computes only itself               [one column lights up; the counter grows by one]
```

Add one line on what you plan to leave out. Then ask for approval or changes.

## Check the outline before showing it

- Could the reader explain step N to someone using only steps 1 to N?
- Does every step add exactly one thing?
- Is every term shown before it is used?
- Does the picture change at every step? A step where it does not needs a reason.
- Is anything here only because it was in the source?
