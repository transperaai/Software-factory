---
id: US-007
type: story
title: Urgent requests jump the queue
status: review
version: 1
created_by: agent:story-writer
story: As a duty coordinator I want urgent requests at the top so that safety work starts first
priority: must
acceptance_criteria:
  - id: AC1
    given: a new request with a safety reason
    when: it is submitted
    then: it appears first in the queue
    kind: happy
  - id: AC2
    given: a routine request
    when: the requester edits its priority
    then: the change is refused
    kind: negative
links:
  serves: [BR-01, UC-01, PER-01]
  from_screen: [WF-05]
---
Body.
