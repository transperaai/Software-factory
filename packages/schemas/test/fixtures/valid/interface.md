---
id: INT-01
type: interface
title: Paging service notification
status: review
version: 1
created_by: agent:story-writer
direction: outbound
trigger: An urgent request is created
auth: API key in a server secret
error_handling: Retry 3 times, then raise an attention card
links:
  required_by: [FR-012]
---
Body.
