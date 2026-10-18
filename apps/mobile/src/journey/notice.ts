// A line the next screen shows once, such as "Welcome, Nadia" after setup or "Signed in with Google".
let next: string | null = null;

export const postNotice = (text: string) => {
  next = text;
};

export const takeNotice = () => {
  const text = next;
  next = null;
  return text;
};
