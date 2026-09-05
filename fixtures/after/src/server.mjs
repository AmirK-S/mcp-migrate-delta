// Conformance fixture: the "after" side of the migration delta.
//
// MCP revision 2026-07-28, written on @modelcontextprotocol/server 2.0.0 and
// @modelcontextprotocol/node 2.0.0. It exposes exactly the same functional
// surface as fixtures/before (same tool, prompt, resource and template names,
// same contents), expressed the way the 2026-07-28 revision expects it:
//
//   - no initialize handshake, no session id: the entry serves per request;
//   - server-initiated elicitation / sampling / roots requests are gone,
//     replaced by multi-round-trip results (input_required + inputRequests);
//   - logging/setLevel, ping, resources/subscribe and resources/unsubscribe
//     no longer exist as methods;
//   - Host and Origin validation is explicit, in front of the handler.
//
// Run: PORT=3002 node fixtures/after/src/server.mjs
// Endpoint: POST http://localhost:3002/mcp

import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import {
    createMcpHandler,
    createRequestStateCodec,
    McpServer,
    ResourceTemplate,
    acceptedContent,
    completable,
    inputRequired,
    inputResponse
} from '@modelcontextprotocol/server';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod';

const PORT = Number(process.env.PORT ?? 3002);
const MCP_PATH = '/mcp';

// A 1x1 red PNG and a 44 byte silent WAV, small enough to inline.
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV_SILENT = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const CLIENT_CAPABILITIES_KEY = 'io.modelcontextprotocol/clientCapabilities';

// requestState travels through the client and comes back attacker controlled.
// The SDK codec signs it with HMAC-SHA256; `verify` is wired into the server
// options below, so a tampered value is refused before any handler runs.
const requestStateCodec = createRequestStateCodec({ key: randomBytes(32), ttlSeconds: 600 });

const EMPTY_INPUT = z.object({});

/** The client capabilities declared by the request currently being served. */
function clientCapabilities(ctx) {
    return ctx.mcpReq.envelope?.[CLIENT_CAPABILITIES_KEY] ?? {};
}

function text(value) {
    return { content: [{ type: 'text', text: value }] };
}

function createFixtureServer() {
    const server = new McpServer(
        { name: 'mcp-migrate-delta-after', version: '1.0.0' },
        {
            capabilities: {
                tools: { listChanged: true },
                prompts: { listChanged: true },
                resources: {},
                completions: {}
            },
            // 2026-07-28 requires ttlMs and cacheScope on every cacheable
            // result. The SDK always emits them; these hints only pick the
            // values, instead of the conservative 0 / private default.
            cacheHints: {
                'tools/list': { ttlMs: 300000, scope: 'public' },
                'prompts/list': { ttlMs: 300000, scope: 'public' },
                'resources/list': { ttlMs: 300000, scope: 'public' },
                'resources/templates/list': { ttlMs: 300000, scope: 'public' },
                'server/discover': { ttlMs: 300000, scope: 'public' },
                'resources/read': { ttlMs: 300000, scope: 'private' }
            },
            requestState: { verify: requestStateCodec.verify }
        }
    );

    // ---------------------------------------------------------------- tools

    server.registerTool(
        'test_simple_text',
        { description: 'Returns a single text content block.', inputSchema: EMPTY_INPUT },
        async () => text('This is a simple text response for testing.')
    );

    server.registerTool(
        'test_image_content',
        { description: 'Returns a single image content block.', inputSchema: EMPTY_INPUT },
        async () => ({ content: [{ type: 'image', data: PNG_1X1, mimeType: 'image/png' }] })
    );

    server.registerTool(
        'test_audio_content',
        { description: 'Returns a single audio content block.', inputSchema: EMPTY_INPUT },
        async () => ({ content: [{ type: 'audio', data: WAV_SILENT, mimeType: 'audio/wav' }] })
    );

    server.registerTool(
        'test_embedded_resource',
        { description: 'Returns an embedded resource content block.', inputSchema: EMPTY_INPUT },
        async () => ({
            content: [
                {
                    type: 'resource',
                    resource: {
                        uri: 'test://embedded-resource',
                        mimeType: 'text/plain',
                        text: 'This is an embedded resource content.'
                    }
                }
            ]
        })
    );

    server.registerTool(
        'test_multiple_content_types',
        { description: 'Returns text, image and embedded resource blocks in one result.', inputSchema: EMPTY_INPUT },
        async () => ({
            content: [
                { type: 'text', text: 'Multiple content types test:' },
                { type: 'image', data: PNG_1X1, mimeType: 'image/png' },
                {
                    type: 'resource',
                    resource: {
                        uri: 'test://mixed-content-resource',
                        mimeType: 'application/json',
                        text: JSON.stringify({ mixed: true })
                    }
                }
            ]
        })
    );

    server.registerTool(
        'test_tool_with_progress',
        { description: 'Emits three progress notifications before returning.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            // The progress token must be echoed verbatim: a token of our own
            // making would never be correlated by the caller.
            const progressToken = ctx.mcpReq._meta?.progressToken;
            if (progressToken !== undefined) {
                for (const progress of [0, 50, 100]) {
                    await ctx.mcpReq.notify({
                        method: 'notifications/progress',
                        params: { progressToken, progress, total: 100 }
                    });
                }
            }
            return text(`Progress complete: ${String(progressToken)}`);
        }
    );

    server.registerTool(
        'test_error_handling',
        { description: 'Fails on purpose, reported as a tool error rather than a protocol error.', inputSchema: EMPTY_INPUT },
        async () => {
            throw new Error('This is a test error from test_error_handling.');
        }
    );

    server.registerTool(
        'test_missing_capability',
        { description: 'Requires a client capability that the caller may not have declared.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            if (clientCapabilities(ctx).sampling === undefined) {
                return inputRequired({
                    inputRequests: {
                        needs_sampling: inputRequired.createMessage({
                            messages: [{ role: 'user', content: { type: 'text', text: 'Anything.' } }],
                            maxTokens: 16
                        })
                    }
                });
            }
            return text('Sampling capability was declared.');
        }
    );

    server.registerTool(
        'test_streaming_elicitation',
        { description: 'Asks for user input without ever opening an independent server request.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const answer = acceptedContent(ctx.mcpReq.inputResponses, 'stream_input');
            if (!answer) {
                return inputRequired({
                    inputRequests: {
                        stream_input: inputRequired.elicit({
                            message: 'Provide a value.',
                            requestedSchema: {
                                type: 'object',
                                properties: { value: { type: 'string' } },
                                required: ['value']
                            }
                        })
                    }
                });
            }
            return text(`Received: ${String(answer.value)}`);
        }
    );

    server.registerTool(
        'test_logging_tool',
        { description: 'Emits log notifications, but only when the caller asked for a log level.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            // ctx.mcpReq.log honours the level the request declared; with no
            // level declared nothing is put on the wire.
            await ctx.mcpReq.log('info', 'test_logging_tool ran');
            return text('Logging tool finished.');
        }
    );

    server.registerTool(
        'test_trigger_tool_change',
        { description: 'Publishes a tools list changed notification to open subscriptions.', inputSchema: EMPTY_INPUT },
        async () => {
            notifier?.toolsChanged();
            return text('Tool list change published.');
        }
    );

    server.registerTool(
        'test_trigger_prompt_change',
        { description: 'Publishes a prompts list changed notification to open subscriptions.', inputSchema: EMPTY_INPUT },
        async () => {
            notifier?.promptsChanged();
            return text('Prompt list change published.');
        }
    );

    // -------------------------------------------- tools, multi-round-trip

    server.registerTool(
        'test_input_required_result_elicitation',
        { description: 'Asks the caller for a name, then greets it.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const answer = acceptedContent(ctx.mcpReq.inputResponses, 'user_name', z.object({ name: z.string() }));
            if (!answer) {
                return inputRequired({
                    inputRequests: {
                        user_name: inputRequired.elicit({
                            message: 'What is your name?',
                            requestedSchema: {
                                type: 'object',
                                properties: { name: { type: 'string' } },
                                required: ['name']
                            }
                        })
                    }
                });
            }
            return text(`Hello, ${answer.name}!`);
        }
    );

    server.registerTool(
        'test_input_required_result_sampling',
        { description: 'Asks the caller to sample a completion, then reports it.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const answer = inputResponse(ctx.mcpReq.inputResponses, 'sample_request');
            if (answer.kind !== 'sampling') {
                return inputRequired({
                    inputRequests: {
                        sample_request: inputRequired.createMessage({
                            messages: [
                                { role: 'user', content: { type: 'text', text: 'What is the capital of France?' } }
                            ],
                            maxTokens: 100
                        })
                    }
                });
            }
            const content = answer.result.content;
            return text(`Sampled: ${content?.type === 'text' ? content.text : 'non text content'}`);
        }
    );

    server.registerTool(
        'test_input_required_result_list_roots',
        { description: 'Asks the caller for its roots, then reports how many it has.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const answer = inputResponse(ctx.mcpReq.inputResponses, 'client_roots');
            if (answer.kind !== 'roots') {
                return inputRequired({ inputRequests: { client_roots: inputRequired.listRoots() } });
            }
            return text(`Roots: ${answer.roots.length}`);
        }
    );

    server.registerTool(
        'test_input_required_result_request_state',
        { description: 'Carries signed request state across a confirmation round trip.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const state = ctx.mcpReq.requestState();
            const answer = acceptedContent(ctx.mcpReq.inputResponses, 'confirm', z.object({ ok: z.boolean() }));
            if (!state || !answer) {
                return inputRequired({
                    requestState: await requestStateCodec.mint({ kind: 'request-state', nonce: randomUUID() }),
                    inputRequests: {
                        confirm: inputRequired.elicit({
                            message: 'Confirm?',
                            requestedSchema: {
                                type: 'object',
                                properties: { ok: { type: 'boolean' } },
                                required: ['ok']
                            }
                        })
                    }
                });
            }
            return text(`state-ok: ${String(answer.ok)}`);
        }
    );

    server.registerTool(
        'test_input_required_result_multiple_inputs',
        { description: 'Asks for elicitation, sampling and roots in a single round.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const responses = ctx.mcpReq.inputResponses;
            const name = acceptedContent(responses, 'user_name', z.object({ name: z.string() }));
            const greeting = inputResponse(responses, 'greeting');
            const roots = inputResponse(responses, 'client_roots');
            if (!name || greeting.kind !== 'sampling' || roots.kind !== 'roots') {
                return inputRequired({
                    requestState: await requestStateCodec.mint({ kind: 'multiple-inputs', nonce: randomUUID() }),
                    inputRequests: {
                        user_name: inputRequired.elicit({
                            message: 'What is your name?',
                            requestedSchema: {
                                type: 'object',
                                properties: { name: { type: 'string' } },
                                required: ['name']
                            }
                        }),
                        greeting: inputRequired.createMessage({
                            messages: [{ role: 'user', content: { type: 'text', text: 'Write a greeting.' } }],
                            maxTokens: 100
                        }),
                        client_roots: inputRequired.listRoots()
                    }
                });
            }
            return text(`Collected name, greeting and ${roots.roots.length} roots.`);
        }
    );

    server.registerTool(
        'test_input_required_result_multi_round',
        { description: 'Asks for a name, then for a colour, over three rounds.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const state = ctx.mcpReq.requestState();
            const round = typeof state === 'object' && state !== null ? Number(state.round) : 0;
            if (round < 1) {
                return inputRequired({
                    requestState: await requestStateCodec.mint({ kind: 'multi-round', round: 1, nonce: randomUUID() }),
                    inputRequests: {
                        user_name: inputRequired.elicit({
                            message: 'What is your name?',
                            requestedSchema: {
                                type: 'object',
                                properties: { name: { type: 'string' } },
                                required: ['name']
                            }
                        })
                    }
                });
            }
            if (round < 2) {
                const name = acceptedContent(ctx.mcpReq.inputResponses, 'user_name', z.object({ name: z.string() }));
                return inputRequired({
                    requestState: await requestStateCodec.mint({
                        kind: 'multi-round',
                        round: 2,
                        name: name?.name ?? 'friend',
                        nonce: randomUUID()
                    }),
                    inputRequests: {
                        favourite_colour: inputRequired.elicit({
                            message: 'What is your favourite colour?',
                            requestedSchema: {
                                type: 'object',
                                properties: { color: { type: 'string' } },
                                required: ['color']
                            }
                        })
                    }
                });
            }
            const colour = acceptedContent(ctx.mcpReq.inputResponses, 'favourite_colour', z.object({ color: z.string() }));
            return text(`${String(state.name)} likes ${colour?.color ?? 'nothing'}.`);
        }
    );

    server.registerTool(
        'test_input_required_result_tampered_state',
        { description: 'Refuses request state whose integrity check fails.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            // Reaching the handler at all means the codec already verified the
            // state: a tampered value never gets this far.
            const state = ctx.mcpReq.requestState();
            const answer = acceptedContent(ctx.mcpReq.inputResponses, 'confirm', z.object({ ok: z.boolean() }));
            if (!state || !answer) {
                return inputRequired({
                    requestState: await requestStateCodec.mint({ kind: 'tampered-state', nonce: randomUUID() }),
                    inputRequests: {
                        confirm: inputRequired.elicit({
                            message: 'Confirm?',
                            requestedSchema: {
                                type: 'object',
                                properties: { ok: { type: 'boolean' } },
                                required: ['ok']
                            }
                        })
                    }
                });
            }
            return text(`Verified state, confirmation: ${String(answer.ok)}`);
        }
    );

    server.registerTool(
        'test_input_required_result_capabilities',
        { description: 'Only asks for input kinds the caller declared support for.', inputSchema: EMPTY_INPUT },
        async (_args, ctx) => {
            const capabilities = clientCapabilities(ctx);
            const responses = ctx.mcpReq.inputResponses;
            const inputRequests = {};

            if (capabilities.elicitation !== undefined && !acceptedContent(responses, 'user_name')) {
                inputRequests.user_name = inputRequired.elicit({
                    message: 'What is your name?',
                    requestedSchema: {
                        type: 'object',
                        properties: { name: { type: 'string' } },
                        required: ['name']
                    }
                });
            }
            if (capabilities.sampling !== undefined && inputResponse(responses, 'greeting').kind !== 'sampling') {
                inputRequests.greeting = inputRequired.createMessage({
                    messages: [{ role: 'user', content: { type: 'text', text: 'Write a greeting.' } }],
                    maxTokens: 100
                });
            }
            if (capabilities.roots !== undefined && inputResponse(responses, 'client_roots').kind !== 'roots') {
                inputRequests.client_roots = inputRequired.listRoots();
            }

            if (Object.keys(inputRequests).length > 0) {
                return inputRequired({ inputRequests });
            }
            return text('Collected every input the caller can supply.');
        }
    );

    // -------------------------------------------------------------- prompts

    server.registerPrompt(
        'test_simple_prompt',
        { description: 'A prompt with no arguments.' },
        () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'This is a simple prompt for testing.' } }]
        })
    );

    server.registerPrompt(
        'test_prompt_with_arguments',
        {
            description: 'A prompt that substitutes two arguments into its message.',
            argsSchema: z.object({
                arg1: completable(z.string().describe('First argument'), value =>
                    ['alpha', 'beta', 'gamma', 'testValue1'].filter(candidate => candidate.startsWith(value))
                ),
                arg2: z.string().describe('Second argument')
            })
        },
        ({ arg1, arg2 }) => ({
            messages: [
                { role: 'user', content: { type: 'text', text: `Prompt with arguments: ${arg1} and ${arg2}` } }
            ]
        })
    );

    server.registerPrompt(
        'test_prompt_with_embedded_resource',
        {
            description: 'A prompt that embeds the resource named by its argument.',
            argsSchema: z.object({ resourceUri: z.string().describe('URI of the resource to embed') })
        },
        ({ resourceUri }) => ({
            messages: [
                { role: 'user', content: { type: 'text', text: 'Here is the resource you asked for:' } },
                {
                    role: 'user',
                    content: {
                        type: 'resource',
                        resource: {
                            uri: resourceUri,
                            mimeType: 'text/plain',
                            text: `Embedded content of ${resourceUri}`
                        }
                    }
                }
            ]
        })
    );

    server.registerPrompt(
        'test_prompt_with_image',
        { description: 'A prompt whose second message is an image.' },
        () => ({
            messages: [
                { role: 'user', content: { type: 'text', text: 'Here is an image:' } },
                { role: 'user', content: { type: 'image', data: PNG_1X1, mimeType: 'image/png' } }
            ]
        })
    );

    server.registerPrompt(
        'test_input_required_result_prompt',
        { description: 'A prompt that asks the caller for context before it renders.' },
        ctx => {
            const answer = acceptedContent(ctx.mcpReq.inputResponses, 'user_context', z.object({ context: z.string() }));
            if (!answer) {
                return inputRequired({
                    inputRequests: {
                        user_context: inputRequired.elicit({
                            message: 'What context should the prompt use?',
                            requestedSchema: {
                                type: 'object',
                                properties: { context: { type: 'string' } },
                                required: ['context']
                            }
                        })
                    }
                });
            }
            return {
                messages: [
                    { role: 'user', content: { type: 'text', text: `Prompt rendered with context: ${answer.context}` } }
                ]
            };
        }
    );

    // ------------------------------------------------ resources and template

    server.registerResource(
        'static-text',
        'test://static-text',
        {
            description: 'A static text resource.',
            mimeType: 'text/plain',
            cacheHint: { ttlMs: 300000, scope: 'private' }
        },
        async uri => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'text/plain',
                    text: 'This is the content of the static text resource.'
                }
            ]
        })
    );

    server.registerResource(
        'static-binary',
        'test://static-binary',
        {
            description: 'A static binary resource.',
            mimeType: 'image/png',
            cacheHint: { ttlMs: 300000, scope: 'private' }
        },
        async uri => ({
            contents: [{ uri: uri.href, mimeType: 'image/png', blob: PNG_1X1 }]
        })
    );

    server.registerResource(
        'template-data',
        new ResourceTemplate('test://template/{id}/data', { list: undefined }),
        {
            description: 'A templated resource whose id is substituted into its body.',
            mimeType: 'application/json',
            cacheHint: { ttlMs: 300000, scope: 'private' }
        },
        async (uri, variables) => {
            const id = String(variables?.id ?? '');
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({ id, templateTest: true, data: `Data for ID: ${id}` })
                    }
                ]
            };
        }
    );

    return server;
}

// One factory serves every request; the handler owns the subscription bus that
// the two trigger tools publish onto.
const handler = createMcpHandler(() => createFixtureServer(), {
    onerror: error => console.error('[after] handler error:', error.message)
});
const notifier = handler.notify;

// The entry is deliberately validation free: plain node:http has no middleware
// chain, so the DNS rebinding guards are composed here, in front of it. Both
// answer the request themselves and return false when they reject it.
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();
const nodeHandler = toNodeHandler(handler, {
    onerror: error => console.error('[after] adapter error:', error.message)
});

const httpServer = createServer((req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== MCP_PATH) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
});

httpServer.listen(PORT, '127.0.0.1', () => {
    console.error(`fixture after (2026-07-28) listening on http://127.0.0.1:${PORT}${MCP_PATH}`);
});

const shutdown = async () => {
    await handler.close();
    httpServer.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
