# Tenant-segregation security contract

An adapter may report tenant-isolation security evidence only when its lab has:

1. two independently authenticated principals (`tenant-a` and `tenant-b`);
2. two provider-native isolation scopes (namespace, workspace, project, queue,
   or equivalent) mapped one-to-one to those principals;
3. a victim run in tenant A, plus authenticated tenant-B attempts to read,
   signal, cancel, and enumerate that run; and
4. a same-tenant control run proving the rejected attacker action did not affect
   unrelated work.

A shared administrator token, a shared development namespace, an internal-only
endpoint, or application-supplied tenant labels does not satisfy this contract.
Such an adapter remains `NOT_VALIDATED`.

The evidence bundle must retain the provider-native scope identifiers and HTTP/
SDK outcomes, but never credential material. A rejected action is a pass only
when the control run completes and the victim remains observable solely to its
own principal.
