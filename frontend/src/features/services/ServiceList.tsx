import { useState, type FormEvent } from "react";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useSaveService, useServices, useSetServiceActive, type Service } from "./services";

function ServiceRow({ service }: { service: Service }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(service.name);
  const rename = useSaveService(service.id);
  const toggle = useSetServiceActive();

  function save(event: FormEvent) {
    event.preventDefault();
    rename.mutate(name, { onSuccess: () => setRenaming(false) });
  }

  return (
    <li>
      {renaming ? (
        <form onSubmit={save}>
          <label>
            {messages.serviceNameLabel}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button type="submit">{messages.saveName}</button>
          <button type="button" onClick={() => setRenaming(false)}>
            {messages.cancelForm}
          </button>
        </form>
      ) : (
        <>
          <span>{service.name}</span>
          {!service.active && <span> ({messages.inactiveTag})</span>}{" "}
          <button
            type="button"
            aria-label={`${messages.renameService}: ${service.name}`}
            onClick={() => setRenaming(true)}
          >
            {messages.renameService}
          </button>{" "}
          <button
            type="button"
            aria-label={`${service.active ? messages.deactivateService : messages.activateService}: ${service.name}`}
            onClick={() => toggle.mutate({ id: service.id, active: !service.active })}
          >
            {service.active ? messages.deactivateService : messages.activateService}
          </button>
        </>
      )}
    </li>
  );
}

export function ServiceList() {
  const heading = useScreenFocus();
  const services = useServices();
  const [name, setName] = useState("");
  const add = useSaveService();

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(name, { onSuccess: () => setName("") });
  }

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.servicesTitle}
      </h1>
      <form onSubmit={submit}>
        <label>
          {messages.serviceNameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>{" "}
        <button type="submit" disabled={add.isPending}>
          {messages.addService}
        </button>
      </form>
      {services.isPending && <p role="status">{messages.loading}</p>}
      {services.isError && <p role="alert">{messages.genericError}</p>}
      {services.data?.length === 0 && <p>{messages.noServices}</p>}
      <ul>
        {services.data?.map((service) => (
          <ServiceRow key={service.id} service={service} />
        ))}
      </ul>
    </section>
  );
}
