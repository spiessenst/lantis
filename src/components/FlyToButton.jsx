// src/components/FlyToButton.jsx
export default function FlyToButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-2 rounded-full bg-[#009391] text-white font-medium shadow-md hover:bg-[#007f7c] transition duration-200"
    >
      {label}
    </button>
  );
}
