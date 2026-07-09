import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { LiveGuildSettingsPanel } from '@/features/guilds/live-guild-settings-panel';
import { LiveGuildsIndexPanel } from '@/features/guilds/live-guilds-index-panel';
import {
  GUILD_ACTIONS,
  GUILD_PERMISSION_PRESETS,
  GUILD_ROLES,
  GUILD_STRUCTURE_TEMPLATES,
  getGuildBlueprint,
  guildPath,
  guildSectionPath,
  type GuildBlueprint,
  type GuildSurface,
} from '@/features/guilds/guilds-data';

function SurfaceBadge({ surface }: { surface: GuildSurface }) {
  return <span className="guild-surface-badge">{surface}</span>;
}

function GuildNav({ groupId }: { groupId: string }) {
  const items = [
    { href: guildPath(groupId), label: 'Home' },
    { href: guildSectionPath(groupId, 'members'), label: 'Members' },
    { href: guildSectionPath(groupId, 'proposals'), label: 'Proposals' },
    { href: guildSectionPath(groupId, 'settings'), label: 'Settings' },
  ];

  return (
    <nav className="guild-detail-nav" aria-label="Guild sections">
      {items.map((item) => (
        <Link
          key={item.href}
          className="guild-detail-nav-link"
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function GuildBlueprintCard({ guild }: { guild: GuildBlueprint }) {
  return (
    <Link className="guild-card" href={guildPath(guild.id)}>
      <span className="guild-card-eyebrow">{guild.eyebrow}</span>
      <span className="guild-card-title">{guild.name}</span>
      <span className="guild-card-copy">{guild.summary}</span>
      <span className="guild-card-meta">
        <span>{guild.access}</span>
        <span>{guild.governance}</span>
        <span>{guild.members}</span>
      </span>
    </Link>
  );
}

function GuildActionList({
  release,
  showTechnical = false,
}: {
  release?: 'MVP' | 'Collaboration' | 'Advanced';
  showTechnical?: boolean;
}) {
  const actions = release
    ? GUILD_ACTIONS.filter((action) => action.release === release)
    : GUILD_ACTIONS;

  return (
    <div className="guild-action-list">
      {actions.map((action) => (
        <article key={action.id} className="guild-action-card">
          <div className="guild-action-card-head">
            <h3>{action.label}</h3>
            <SurfaceBadge surface={action.surface} />
          </div>
          <p>{action.userValue}</p>
          {showTechnical ? (
            <>
              <div className="guild-method-stack">
                {action.sdkMethods.map((method) => (
                  <code key={method}>{method}</code>
                ))}
              </div>
              <span className="guild-contract-action">
                {action.contractAction}
              </span>
            </>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function GuildRoleGrid() {
  return (
    <div className="guild-role-grid">
      {GUILD_ROLES.map((role) => (
        <article key={role.id} className="guild-role-card">
          <div>
            <h3>{role.name}</h3>
            <span>{role.permission}</span>
          </div>
          <p>{role.description}</p>
        </article>
      ))}
    </div>
  );
}

function GuildStructureTemplateGrid() {
  return (
    <div className="guild-structure-grid">
      {GUILD_STRUCTURE_TEMPLATES.map((structure) => (
        <article key={structure.id} className="guild-structure-card">
          <div className="guild-structure-card-head">
            <span>{structure.title}</span>
            <code>{structure.channel}</code>
          </div>
          <p>{structure.summary}</p>
          <small>{structure.userValue}</small>
        </article>
      ))}
    </div>
  );
}

function GuildPermissionPresetList({ groupId }: { groupId: string }) {
  return (
    <div className="guild-permission-list">
      {GUILD_PERMISSION_PRESETS.map((permission) => (
        <article key={permission.id} className="guild-permission-card">
          <div>
            <span>{permission.title}</span>
            <strong>{permission.level}</strong>
          </div>
          <p>{permission.summary}</p>
          <code>{permission.path(groupId)}</code>
        </article>
      ))}
    </div>
  );
}

export function GuildsIndexPanel() {
  return <LiveGuildsIndexPanel />;
}

export function GuildDetailPanel({ groupId }: { groupId: string }) {
  const guild = getGuildBlueprint(groupId);

  return (
    <OsAppScreen
      title={guild.name}
      subtitle={guild.summary}
      backFallbackHref="/groups"
    >
      <div className="guilds-page">
        <GuildNav groupId={guild.id} />

        <section className="guild-hero-card guild-detail-hero">
          <p className="guild-eyebrow">{guild.eyebrow}</p>
          <h2>{guild.name}</h2>
          <p>{guild.description}</p>
          <div className="guild-card-meta">
            <span>{guild.access}</span>
            <span>{guild.governance}</span>
            <span>{guild.members}</span>
          </div>
          <div className="guild-tag-list">
            {guild.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </section>

        <section className="guild-section">
          <div className="guild-section-head">
            <p className="guild-eyebrow">Feed structure</p>
            <h2>Channels can start as metadata</h2>
            <p>
              Guild posts can carry `channel`, `kind`, and `audiences` metadata,
              so users can build useful structures before the contract needs a
              new product object.
            </p>
          </div>
          <div className="guild-channel-grid">
            {guild.channels.map((channel) => (
              <article key={channel} className="guild-channel-card">
                <span>{channel}</span>
                <code>channel: "{channel}"</code>
              </article>
            ))}
          </div>
        </section>

        <section className="guild-section">
          <div className="guild-section-head">
            <p className="guild-eyebrow">Focused actions</p>
            <h2>Join, post, and leave stay lightweight</h2>
          </div>
          <GuildActionList release="MVP" />
        </section>
      </div>
    </OsAppScreen>
  );
}

export function GuildProposalsPanel({ groupId }: { groupId: string }) {
  const guild = getGuildBlueprint(groupId);

  return (
    <OsAppScreen
      title="Guild proposals"
      subtitle={
        guild.governance === 'Collaborative'
          ? guild.name
          : 'Optional collaborative governance'
      }
      backFallbackHref={guildPath(groupId)}
    >
      <div className="guilds-page">
        <GuildNav groupId={guild.id} />
        <section className="guild-hero-card">
          <p className="guild-eyebrow">Not every guild is a DAO</p>
          <h2>Make member-led governance opt-in.</h2>
          <p>
            `memberDriven` should be presented as collaborative governance. When
            enabled, permission changes, invites, role changes, and custom
            decisions can route through group proposals.
          </p>
        </section>
        <GuildActionList release="Collaboration" />
      </div>
    </OsAppScreen>
  );
}

export function GuildSettingsPanel({ groupId }: { groupId: string }) {
  return <LiveGuildSettingsPanel groupId={groupId} />;
}
