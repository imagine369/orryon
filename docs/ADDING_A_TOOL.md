# Adding an agent tool

Single checklist for a new Orryon Life OS tool. Do every step — import-time validation and tests will fail if anything is missing.

## Checklist

1. **Schema** — `core/tools/schemas/<domain>.py`
   - Add an OpenAI-format function schema (`name`, `description`, `parameters`).
   - Register the name in `core/tools/schemas/__init__.py` (`_LEGACY_ORDER` if order matters for tests).

2. **Handler implementation** — `core/tools/handlers/<domain>.py`
   - Implement `_your_tool(args: dict, user_id: str) -> dict` (business result only).
   - Do **not** normalize dates, amounts, categories, or moods here — that belongs in `normalize.py`.
   - Do **not** embed dashboard tab names in the handler; tabs are bound in the registry (step 3).

3. **Registry metadata** — `core/tools/registry.py` → `TOOL_SPECS`
   - Add one entry: `"tool_name": {"impl": h._your_tool, "tabs": ["dashboard", ...]}`.
   - Use `[]` for read-only tools that should not refresh UI tabs.
   - `bind_handler` wraps `impl` so dispatch always sees `{result, tabs}`.

4. **Canonical name** — `core/canonical_tools.py`
   - Append the name to `CANONICAL_TOOL_NAMES` (agent-facing tools only).

5. **Reprompt line** — `core/canonical_tools.py`
   - Add the tool to the appropriate `_REPROMPT_SECTIONS` string so soft re-prompt lists stay accurate.

6. **System prompt** — `core/system_prompt.py`
   - Ensure the tool appears in the CAPABILITIES / tool list section (or rely on `CANONICAL_TOOL_NAMES` if already generated from there).

7. **User-facing docs** (if product-visible) — `docs/CAPABILITIES.md`, Help FAQ.

8. **Argument normalization** (only if needed) — `core/tools/normalize.py`
   - Add tool-specific coercion in `normalize_args` or shared field maps — never duplicate in handlers.

9. **Tests** — `tests/test_tools_registry.py`, `tests/tool_minimal_args.py`, or domain-specific tests
   - Cover happy path and destructive `user_confirmed` if applicable.
   - Run `pytest tests/test_capabilities_sync.py` — every canonical name must appear in `get_system_prompt()`.

## Validation (automatic)

On import, `core/tools/__init__.py` runs:

- `validate_canonical_schemas(TOOL_SCHEMAS)` — every canonical name has a schema.
- `validate_tool_registry()` — every canonical name has `impl` + `tabs` in `TOOL_SPECS`.

Run tests:

```bash
pytest tests/test_tools_registry.py -q
```

## Handler return contract

Registered handlers (after `bind_handler`) return:

```python
{"result": {<status, id, ...>}, "tabs": ["dashboard", "budget"]}  # tabs optional
```

`execute_tool` unwraps this and returns `(result, tabs)` to the agent loop.

Implementation functions stay plain `dict` returns; tab refresh metadata lives only in `TOOL_SPECS`.
