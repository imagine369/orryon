"use client";

import { UserPlus } from "lucide-react";
import {
  canAddToContacts,
  downloadContactVCard,
  isNativeTapLink,
  type ContactCardBlock,
  type ContactLink,
} from "@/lib/chat-contact-blocks";
import { CHAT_LINK_CLASS, sanitizeChatHref } from "@/lib/chat-message-links";

function ContactLinkRow({ link }: { link: ContactLink }) {
  const href = sanitizeChatHref(link.href);
  if (!href) {
    return <span className="text-[14px] text-white/70">{link.label}</span>;
  }

  const external = /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      className={`block text-[14px] leading-relaxed ${CHAT_LINK_CLASS}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {link.label}
    </a>
  );
}

interface ChatContactCardProps {
  block: ContactCardBlock;
}

function sortLinksForOneTap(links: ContactLink[]): ContactLink[] {
  return [...links].sort((a, b) => {
    const aNative = isNativeTapLink(a.href);
    const bNative = isNativeTapLink(b.href);
    if (aNative === bNative) return 0;
    return aNative ? -1 : 1;
  });
}

export function ChatContactCard({ block }: ChatContactCardProps) {
  const showAddToContacts = canAddToContacts(block);
  const links = sortLinksForOneTap(block.links);

  return (
    <div className="my-3 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-3.5">
      <p className="mb-2.5 text-[15px] font-semibold leading-snug text-white/92">
        {block.title}
      </p>

      <div className="flex flex-col gap-1.5">
        {links.map((link, index) => (
          <ContactLinkRow key={`${link.href}-${index}`} link={link} />
        ))}
      </div>

      {showAddToContacts ? (
        <button
          type="button"
          onClick={() => downloadContactVCard(block)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] py-2.5 text-xs font-semibold text-white/80 transition hover:bg-white/[0.1] hover:text-white"
        >
          <UserPlus className="h-3.5 w-3.5 opacity-70" strokeWidth={1.5} />
          Add to Contacts
        </button>
      ) : null}
    </div>
  );
}
