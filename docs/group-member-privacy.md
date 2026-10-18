# Group member privacy

Group info shows member names and avatars, not email addresses. The same rule
applies to a pair's partner. This deliberately differs from the approved mock.

Anyone with an invite link can join a group. Joining must not reveal every
member's email address to the link holder. `groups.get` therefore stays as it
is; the web client does not try to recover member emails through people search.

Hasan approved this decision on 18 October 2026 while implementing journey 2.
