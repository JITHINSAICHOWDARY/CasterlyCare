const { customAlphabet } = (() => {
  // Lightweight inline nanoid-like generator (avoids extra dependency)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  function customAlphabet(alpha, size) {
    return () => {
      let id = '';
      for (let i = 0; i < size; i++) {
        id += alpha[Math.floor(Math.random() * alpha.length)];
      }
      return id;
    };
  }
  return { customAlphabet };
})();

const genDoctorCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const genChatCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

function generateUniqueDoctorId() {
  return `DOC-${genDoctorCode()}`;
}

function generateChatCode() {
  return `CHAT-${genChatCode()}`;
}

module.exports = { generateUniqueDoctorId, generateChatCode };
