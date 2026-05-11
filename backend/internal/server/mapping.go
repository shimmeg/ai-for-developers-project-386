package server

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/service"
)

// --- WorkingDay union -------------------------------------------------------

func domainWorkingDayToAPI(d domain.WorkingDay) (api.WorkingDay, error) {
	var out api.WorkingDay
	switch d.Status {
	case domain.DayClosed:
		if err := out.FromClosedDay(api.ClosedDay{Status: api.ClosedDayStatusClosed}); err != nil {
			return api.WorkingDay{}, err
		}
	case domain.DayOpen:
		if err := out.FromOpenDay(api.OpenDay{
			Status: api.Open,
			Start:  d.Start,
			End:    d.End,
		}); err != nil {
			return api.WorkingDay{}, err
		}
	default:
		return api.WorkingDay{}, fmt.Errorf("unknown working day status %q", d.Status)
	}
	return out, nil
}

// apiWorkingDayToDomain peeks at the union's status discriminator to decide
// which variant to extract. The generated WorkingDay holds a json.RawMessage
// internally so we re-use that representation via the public MarshalJSON.
func apiWorkingDayToDomain(w api.WorkingDay) (domain.WorkingDay, error) {
	raw, err := w.MarshalJSON()
	if err != nil {
		return domain.WorkingDay{}, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return domain.WorkingDay{}, domain.NewValidationError("workingDay", "must not be empty")
	}
	var peek struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil {
		return domain.WorkingDay{}, domain.NewValidationError("workingDay", err.Error())
	}
	switch peek.Status {
	case "closed":
		return domain.WorkingDay{Status: domain.DayClosed}, nil
	case "open":
		od, err := w.AsOpenDay()
		if err != nil {
			return domain.WorkingDay{}, domain.NewValidationError("workingDay", err.Error())
		}
		return domain.WorkingDay{Status: domain.DayOpen, Start: od.Start, End: od.End}, nil
	default:
		return domain.WorkingDay{}, domain.NewValidationError("workingDay.status", fmt.Sprintf("must be \"open\" or \"closed\", got %q", peek.Status))
	}
}

// --- Settings ---------------------------------------------------------------

func domainSettingsToAPI(s domain.OwnerSettings) (api.OwnerSettings, error) {
	wh, err := domainWorkingHoursToAPI(s.WorkingHours)
	if err != nil {
		return api.OwnerSettings{}, err
	}
	return api.OwnerSettings{
		Timezone:     s.Timezone,
		WorkingHours: wh,
	}, nil
}

func domainWorkingHoursToAPI(w domain.WorkingHours) (api.WorkingHoursByDay, error) {
	mon, err := domainWorkingDayToAPI(w.Monday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	tue, err := domainWorkingDayToAPI(w.Tuesday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	wed, err := domainWorkingDayToAPI(w.Wednesday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	thu, err := domainWorkingDayToAPI(w.Thursday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	fri, err := domainWorkingDayToAPI(w.Friday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	sat, err := domainWorkingDayToAPI(w.Saturday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	sun, err := domainWorkingDayToAPI(w.Sunday)
	if err != nil {
		return api.WorkingHoursByDay{}, err
	}
	return api.WorkingHoursByDay{
		Monday: mon, Tuesday: tue, Wednesday: wed, Thursday: thu,
		Friday: fri, Saturday: sat, Sunday: sun,
	}, nil
}

func apiSettingsToDomain(s api.OwnerSettings) (domain.OwnerSettings, error) {
	wh, err := apiWorkingHoursToDomain(s.WorkingHours)
	if err != nil {
		return domain.OwnerSettings{}, err
	}
	return domain.OwnerSettings{Timezone: s.Timezone, WorkingHours: wh}, nil
}

func apiWorkingHoursToDomain(w api.WorkingHoursByDay) (domain.WorkingHours, error) {
	mon, err := apiWorkingDayToDomain(w.Monday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("monday: %w", err)
	}
	tue, err := apiWorkingDayToDomain(w.Tuesday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("tuesday: %w", err)
	}
	wed, err := apiWorkingDayToDomain(w.Wednesday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("wednesday: %w", err)
	}
	thu, err := apiWorkingDayToDomain(w.Thursday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("thursday: %w", err)
	}
	fri, err := apiWorkingDayToDomain(w.Friday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("friday: %w", err)
	}
	sat, err := apiWorkingDayToDomain(w.Saturday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("saturday: %w", err)
	}
	sun, err := apiWorkingDayToDomain(w.Sunday)
	if err != nil {
		return domain.WorkingHours{}, fmt.Errorf("sunday: %w", err)
	}
	return domain.WorkingHours{
		Monday: mon, Tuesday: tue, Wednesday: wed, Thursday: thu,
		Friday: fri, Saturday: sat, Sunday: sun,
	}, nil
}

// --- EventType --------------------------------------------------------------

func domainEventTypeToAPI(et domain.EventType) api.EventType {
	return api.EventType{
		Slug:            et.Slug,
		Name:            et.Name,
		Description:     et.Description,
		DurationMinutes: int32(et.DurationMinutes),
		Active:          et.Active,
	}
}

func domainEventTypeToPublicAPI(et domain.EventType) api.PublicEventType {
	return api.PublicEventType{
		Slug:            et.Slug,
		Name:            et.Name,
		Description:     et.Description,
		DurationMinutes: int32(et.DurationMinutes),
	}
}

func apiCreateToServiceInput(in api.EventTypeCreate) service.EventTypeInput {
	return service.EventTypeInput{
		Slug:            in.Slug,
		Name:            in.Name,
		Description:     in.Description,
		DurationMinutes: int(in.DurationMinutes),
	}
}

func apiUpdateToServicePatch(in api.EventTypeUpdate) service.EventTypePatch {
	var p service.EventTypePatch
	if in.Slug != nil {
		s := *in.Slug
		p.Slug = &s
	}
	if in.Name != nil {
		n := *in.Name
		p.Name = &n
	}
	if in.Description != nil {
		d := *in.Description
		p.Description = &d
	}
	if in.DurationMinutes != nil {
		dm := int(*in.DurationMinutes)
		p.DurationMinutes = &dm
	}
	if in.Active != nil {
		a := *in.Active
		p.Active = &a
	}
	return p
}

// --- Booking ----------------------------------------------------------------

func domainBookingToAPI(b domain.Booking, loc *time.Location) api.Booking {
	out := api.Booking{
		Id:                      uuid.MustParse(b.ID),
		EventTypeSlug:           b.EventTypeSlugSnapshot,
		EventTypeName:           b.EventTypeNameSnapshot,
		StartTime:               b.StartTime.In(loc),
		DurationMinutesSnapshot: int32(b.DurationMinutesSnapshot),
		GuestName:               b.GuestName,
		GuestEmail:              openapi_types.Email(b.GuestEmail),
		CreatedAt:               b.CreatedAt.In(loc),
	}
	if b.GuestNotes != nil {
		notes := *b.GuestNotes
		out.GuestNotes = &notes
	}
	return out
}

func apiBookingCreateToDomain(in api.BookingCreate) domain.BookingInput {
	var notes *string
	if in.GuestNotes != nil {
		n := *in.GuestNotes
		notes = &n
	}
	return domain.BookingInput{
		StartTime:  in.StartTime,
		GuestName:  in.GuestName,
		GuestEmail: string(in.GuestEmail),
		GuestNotes: notes,
	}
}

// --- Slot picker ------------------------------------------------------------

func slotPickerToAPI(sp service.SlotPicker) api.SlotPickerResponse {
	days := make([]api.DaySlots, len(sp.Days))
	for i, d := range sp.Days {
		days[i] = api.DaySlots{
			Date:   openapi_types.Date{Time: d.Date.In(sp.Location)},
			Status: api.DayStatus(d.Status),
			Slots:  daySlotsToAPI(d.Slots, sp.Location),
		}
	}
	return api.SlotPickerResponse{
		Timezone:    sp.Timezone,
		WindowStart: openapi_types.Date{Time: sp.WindowStart.In(sp.Location)},
		WindowEnd:   openapi_types.Date{Time: sp.WindowEnd.In(sp.Location)},
		Days:        days,
	}
}

func daySlotsToAPI(slots []time.Time, loc *time.Location) []time.Time {
	out := make([]time.Time, len(slots))
	for i, t := range slots {
		out[i] = t.In(loc)
	}
	return out
}
