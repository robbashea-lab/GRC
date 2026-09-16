export default function AssignmentHelp({ policy = false }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary" data-testid="assignment-help">
    Assignment uses platform accounts. Adding a Contact does not add them to this list.
    {policy && ' Business responsibilities do not grant policy approval permission.'}
  </p>;
}
