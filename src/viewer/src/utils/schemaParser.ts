/**
 * Client-side TypeScript schema parser
 * Extracts interfaces/types and builds a dependency graph
 */

export type SchemaNode = {
  id: string;
  name: string;
  type: "schema" | "field";
  filePath: string;
  properties?: Array<{
    name: string;
    type: string;
    required: boolean;
  }>;
  dependencies?: string[];
};

export type SchemaGraph = {
  nodes: Record<string, SchemaNode>;
  edges: Array<{ source: string; target: string; type: string }>;
};

// Maximum content size (1MB) to prevent ReDoS attacks
const MAX_CONTENT_SIZE = 1024 * 1024;
// Maximum iterations for regex loops
const MAX_ITERATIONS = 500;

/**
 * Parse TypeScript content and extract interfaces/types
 */
export function parseTypeScriptSchema(
  content: string,
  filePath: string = "uploaded.ts"
): SchemaNode[] {
  // Security: Limit input size to prevent ReDoS
  if (content.length > MAX_CONTENT_SIZE) {
    console.warn("Content too large for parsing, truncating");
    content = content.slice(0, MAX_CONTENT_SIZE);
  }

  const nodes: SchemaNode[] = [];

  // Match interface declarations
  const interfaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w,\s]+)?\s*\{([^}]+)\}/g;
  let match;
  let iterations = 0;

  while ((match = interfaceRegex.exec(content)) !== null) {
    if (++iterations > MAX_ITERATIONS) {
      console.warn("Max iterations reached for interface parsing");
      break;
    }
    const name = match[1];
    const body = match[2];
    const properties = parseProperties(body);
    const dependencies = extractDependencies(properties);

    nodes.push({
      id: `${filePath}:${name}`,
      name,
      type: "schema",
      filePath,
      properties,
      dependencies,
    });
  }

  // Match type declarations
  const typeRegex = /(?:export\s+)?type\s+(\w+)\s*=\s*\{([^}]+)\}/g;
  iterations = 0;
  while ((match = typeRegex.exec(content)) !== null) {
    if (++iterations > MAX_ITERATIONS) {
      console.warn("Max iterations reached for type parsing");
      break;
    }
    const name = match[1];
    const body = match[2];
    const properties = parseProperties(body);
    const dependencies = extractDependencies(properties);

    nodes.push({
      id: `${filePath}:${name}`,
      name,
      type: "schema",
      filePath,
      properties,
      dependencies,
    });
  }

  return nodes;
}

/**
 * Parse properties from interface/type body
 */
function parseProperties(body: string): Array<{ name: string; type: string; required: boolean }> {
  const properties: Array<{ name: string; type: string; required: boolean }> = [];
  const propRegex = /(\w+)(\?)?:\s*([^;,\n]+)/g;
  let match;

  while ((match = propRegex.exec(body)) !== null) {
    properties.push({
      name: match[1],
      type: match[3].trim(),
      required: !match[2],
    });
  }

  return properties;
}

/**
 * Extract type dependencies from properties
 */
function extractDependencies(
  properties: Array<{ name: string; type: string; required: boolean }>
): string[] {
  const deps = new Set<string>();
  const builtInTypes = new Set([
    "string",
    "number",
    "boolean",
    "null",
    "undefined",
    "any",
    "unknown",
    "never",
    "void",
    "object",
    "Date",
    "Array",
    "Map",
    "Set",
    "Promise",
  ]);

  for (const prop of properties) {
    // Extract type references (capitalized words that aren't built-ins)
    const typeRefs = prop.type.match(/\b[A-Z]\w+/g) || [];
    for (const ref of typeRefs) {
      if (!builtInTypes.has(ref)) {
        deps.add(ref);
      }
    }
  }

  return Array.from(deps);
}

/**
 * Build a graph from before and after schemas
 */
export function buildGraphFromSchemas(
  beforeContent: string | null,
  afterContent: string | null,
  scenarioName: string = "Custom"
): SchemaGraph {
  const nodes: Record<string, SchemaNode> = {};
  const edges: Array<{ source: string; target: string; type: string }> = [];

  // Track schema names from after.ts to avoid duplicates
  const afterSchemaNames = new Set<string>();

  // Parse after schema first (this is the "current" state)
  if (afterContent) {
    const afterNodes = parseTypeScriptSchema(afterContent, `${scenarioName}/after.ts`);
    for (const node of afterNodes) {
      // Create a clean ID without the file path
      const cleanId = `${scenarioName}:${node.name}`;
      nodes[cleanId] = { ...node, id: cleanId, filePath: `${scenarioName}/schema.ts` };
      afterSchemaNames.add(node.name);
    }
  }

  // Parse before schema - only add nodes that don't exist in after.ts (removed schemas)
  if (beforeContent) {
    const beforeNodes = parseTypeScriptSchema(beforeContent, `${scenarioName}/before.ts`);
    for (const node of beforeNodes) {
      // Only add if this schema was removed (not in after.ts)
      if (!afterSchemaNames.has(node.name)) {
        const cleanId = `${scenarioName}:${node.name}`;
        nodes[cleanId] = { ...node, id: cleanId, filePath: `${scenarioName}/schema.ts` };
      }
    }
  }

  // Build edges from dependencies
  const nodeNames = new Map<string, string>();
  for (const [id, node] of Object.entries(nodes)) {
    nodeNames.set(node.name, id);
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (node.dependencies) {
      for (const dep of node.dependencies) {
        const targetId = nodeNames.get(dep);
        if (targetId) {
          edges.push({
            source: id,
            target: targetId,
            type: "depends_on",
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Merge a scenario graph with an existing base graph
 */
export function mergeGraphs(baseGraph: SchemaGraph, scenarioGraph: SchemaGraph): SchemaGraph {
  return {
    nodes: { ...baseGraph.nodes, ...scenarioGraph.nodes },
    edges: [...baseGraph.edges, ...scenarioGraph.edges],
  };
}
