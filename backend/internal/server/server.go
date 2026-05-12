// Package server wires the api.ServerInterface against the service layer.
// Handlers are intentionally thin: parse request, call the service, format
// the response (or error) via the contract's api.* types.
package server

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/api"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/domain"
	"github.com/shimmeg/ai-for-developers-project-386/backend/internal/service"
)

// Server implements api.ServerInterface.
type Server struct {
	Settings   *service.SettingsService
	EventTypes *service.EventTypeService
	Bookings   *service.BookingService
}

func New(
	settings *service.SettingsService,
	eventTypes *service.EventTypeService,
	bookings *service.BookingService,
) *Server {
	return &Server{Settings: settings, EventTypes: eventTypes, Bookings: bookings}
}

// --- Public catalog ---------------------------------------------------------

func (s *Server) PublicEventTypesList(c *gin.Context) {
	cfg := s.Settings.Get()
	items := s.EventTypes.PublicList()
	out := make([]api.PublicEventType, len(items))
	for i, et := range items {
		out[i] = domainEventTypeToPublicAPI(et)
	}
	c.JSON(http.StatusOK, api.CatalogResponse{
		Timezone:   cfg.Timezone,
		EventTypes: out,
	})
}

func (s *Server) PublicEventTypesGet(c *gin.Context, slug api.EventTypeSlug) {
	et, err := s.EventTypes.PublicGet(slug)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, domainEventTypeToPublicAPI(et))
}

func (s *Server) PublicEventTypesSlots(c *gin.Context, slug api.EventTypeSlug) {
	sp, err := s.Bookings.PublicSlots(slug)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, slotPickerToAPI(sp))
}

func (s *Server) PublicEventTypesBook(c *gin.Context, slug api.EventTypeSlug) {
	var body api.BookingCreate
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, domain.NewValidationError("body", err.Error()))
		return
	}
	booking, err := s.Bookings.CreatePublic(slug, apiBookingCreateToDomain(body))
	if err != nil {
		respondError(c, err)
		return
	}
	loc, err := domain.LoadLocation(s.Settings.Get().Timezone)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, domainBookingToAPI(booking, loc))
}

// --- Admin: settings --------------------------------------------------------

func (s *Server) AdminSettingsGet(c *gin.Context) {
	out, err := domainSettingsToAPI(s.Settings.Get())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) AdminSettingsUpdate(c *gin.Context) {
	var body api.OwnerSettings
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, domain.NewValidationError("body", err.Error()))
		return
	}
	settings, err := apiSettingsToDomain(body)
	if err != nil {
		respondError(c, err)
		return
	}
	updated, err := s.Settings.Update(settings)
	if err != nil {
		respondError(c, err)
		return
	}
	out, err := domainSettingsToAPI(updated)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// --- Admin: event types -----------------------------------------------------

func (s *Server) AdminEventTypesList(c *gin.Context) {
	items := s.EventTypes.AdminList()
	out := make([]api.EventType, len(items))
	for i, et := range items {
		out[i] = domainEventTypeToAPI(et)
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) AdminEventTypesCreate(c *gin.Context) {
	var body api.EventTypeCreate
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, domain.NewValidationError("body", err.Error()))
		return
	}
	et, err := s.EventTypes.Create(apiCreateToServiceInput(body))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, domainEventTypeToAPI(et))
}

func (s *Server) AdminEventTypesGet(c *gin.Context, slug api.EventTypeSlug) {
	et, err := s.EventTypes.AdminGet(slug)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, domainEventTypeToAPI(et))
}

func (s *Server) AdminEventTypesUpdate(c *gin.Context, slug api.EventTypeSlug) {
	var body api.EventTypeUpdate
	if err := c.ShouldBindJSON(&body); err != nil {
		respondError(c, domain.NewValidationError("body", err.Error()))
		return
	}
	et, err := s.EventTypes.Update(slug, apiUpdateToServicePatch(body))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, domainEventTypeToAPI(et))
}

// --- Admin: bookings --------------------------------------------------------

func (s *Server) AdminBookingsList(c *gin.Context) {
	items := s.Bookings.AdminListUpcoming()
	loc, err := domain.LoadLocation(s.Settings.Get().Timezone)
	if err != nil {
		respondError(c, err)
		return
	}
	out := make([]api.Booking, len(items))
	for i, b := range items {
		out[i] = domainBookingToAPI(b, loc)
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) AdminBookingsCancel(c *gin.Context, id api.BookingId) {
	if err := s.Bookings.Cancel(id.String()); err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			respondError(c, err)
			return
		}
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
