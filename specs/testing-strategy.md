# Testing Strategy (Initial)

## Scope
Define minimal, practical testing for:
- Next.js web app behavior
- CRE workflow logic/config safety
- Monitoring/alert correctness (once chosen)

## Layers
1. Unit tests for pure logic and adapters.
2. Integration tests for web-to-workflow boundaries.
3. End-to-end smoke tests for key user journeys.
4. Operational checks for workflow success/failure visibility.

## Immediate Minimum
- Add basic tests for any new logic before merge.
- Add one smoke flow for strategy creation/update once API/data model is defined.
- Add config validation checks for CRE runtime inputs.
