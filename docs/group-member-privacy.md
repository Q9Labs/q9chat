# Group member privacy

Group info shows member names and avatars, not email addresses. The same rule
applies to a pair's partner. This deliberately differs from the approved mock.

Anyone with an invite link can join a group. Joining must not reveal every
member's email address to the link holder. `groups.get` therefore stays as it
is. `people.find` returns `email: null` for name matches, including co-members.
An email is returned only when the query exactly matches that email address.
The picker omits the email line for name matches.

Hasan approved this decision on 18 October 2026 while implementing journey 2.
