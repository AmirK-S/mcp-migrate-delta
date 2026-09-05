import { Node, SyntaxKind, type Identifier, type SourceFile, type StringLiteral } from 'ts-morph';

/**
 * Identifiers from `names` used in the file, excluding the import declaration itself.
 * When a name is imported but never used, its import specifier is returned once instead, so
 * a dead import is still reported.
 */
export function identifierUsages(file: SourceFile, names: ReadonlySet<string>): Identifier[] {
  const usages: Identifier[] = [];
  const imported = new Map<string, Identifier>();
  for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const name = id.getText();
    if (!names.has(name)) continue;
    if (id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration)) {
      if (!imported.has(name)) imported.set(name, id);
      continue;
    }
    usages.push(id);
  }
  const used = new Set(usages.map((u) => u.getText()));
  for (const [name, id] of imported) if (!used.has(name)) usages.push(id);
  return usages.sort((a, b) => a.getStart() - b.getStart());
}

/** String literals whose text satisfies `predicate`, wherever they appear. */
export function stringLiteralsMatching(file: SourceFile, predicate: (text: string) => boolean): StringLiteral[] {
  return file.getDescendantsOfKind(SyntaxKind.StringLiteral).filter((s) => predicate(s.getLiteralText()));
}

/**
 * String literals from `methods` used where a JSON-RPC method name lives: the value of a
 * `method` property, or one side of a comparison with something called `.method`.
 * Generic words such as `ping` or `initialize` are only meaningful in that position.
 */
export function methodLiterals(file: SourceFile, methods: ReadonlySet<string>): StringLiteral[] {
  return stringLiteralsMatching(file, (text) => methods.has(text)).filter((literal) => {
    const parent = literal.getParent();
    if (Node.isPropertyAssignment(parent)) return parent.getName() === 'method';
    if (Node.isBinaryExpression(parent)) {
      const other = parent.getLeft() === literal ? parent.getRight() : parent.getLeft();
      return /\.method$/.test(other.getText()) || other.getText() === 'method';
    }
    if (Node.isCaseClause(parent)) {
      const sw = parent.getParent().getParent();
      return Node.isSwitchStatement(sw) && /\.method$|^method$/.test(sw.getExpression().getText());
    }
    return false;
  });
}

/** `-<value>` numeric literals, as a prefix minus applied to a number. */
export function negativeNumericLiterals(file: SourceFile, value: number) {
  return file.getDescendantsOfKind(SyntaxKind.PrefixUnaryExpression).filter((expr) => {
    if (expr.getOperatorToken() !== SyntaxKind.MinusToken) return false;
    const operand = expr.getOperand();
    return Node.isNumericLiteral(operand) && operand.getLiteralValue() === value;
  });
}
